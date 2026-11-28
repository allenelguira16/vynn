import type { JSX } from "../types/jsx";


import {
  createOwner,
  disposeOwner,
  getOwner,
  runWithOwner,
  setOwnerDisposeCallback,
  type Owner,
} from "../life-cycle/owner";
import { $computed } from "../reactivity/computed";
import { untrack } from "../reactivity/effect";
import { createStateValue, type State } from "../reactivity/state";
import { $nodes } from "./$nodes";
import { getCurrentDOMNamespace, withDOMNamespace } from "./namespace";

const FOR_IDENTITY = Symbol("vynn.for.identity");
const FOR_ITEM_STATE = Symbol("vynn.for.item-state");
const FOR_INDEX_STATE = Symbol("vynn.for.index-state");

type ForRow<T> = Owner & {
  [FOR_IDENTITY]?: unknown;
  [FOR_ITEM_STATE]?: State<T>;
  [FOR_INDEX_STATE]?: State<number>;
};

type ForBucket = {
  entries: number[];
  nextIndex: number;
};

function releaseForRow(owner: Owner): void {
  const entry = owner as ForRow<unknown>;
  delete entry[FOR_IDENTITY];
  delete entry[FOR_ITEM_STATE];
  delete entry[FOR_INDEX_STATE];
}

// Map uses SameValueZero, while the existing identity behavior uses Object.is.
// Keep -0 and +0 distinct without penalizing the common object/string/number path.
const negativeZeroIdentity = Symbol("vynn.negative-zero");

function normalizeIdentity(identity: unknown): unknown {
  return typeof identity === "number" && Object.is(identity, -0)
    ? negativeZeroIdentity
    : identity;
}

export function $for<T>(
  items: () => T[],
  each: (item: T, index: State<number>) => JSX.Element,
  getKey: undefined,
  warnMissingKey: true,
): JSX.Element;

export function $for<T>(
  items: () => T[],
  each: (item: T, index: State<number>) => JSX.Element,
): JSX.Element;

export function $for<T, K>(
  items: () => T[],
  each: (item: State<T>, index: State<number>) => JSX.Element,
  getKey: (item: T, index: number) => K,
): JSX.Element;

export function $for<T, K>(
  items: () => T[],
  each:
    | ((item: T, index: State<number>) => JSX.Element)
    | ((item: State<T>, index: State<number>) => JSX.Element),
  getKey: ((item: T, index: number) => K) | undefined,
  warnMissingKey: true,
): JSX.Element;

export function $for<T, K>(
  items: () => T[],
  each:
    | ((item: T, index: State<number>) => JSX.Element)
    | ((item: State<T>, index: State<number>) => JSX.Element),
  getKey: ((item: T, index: number) => K) | undefined,
  warnMissingKey: boolean,
  stableRow?: boolean,
  trackIndex?: boolean,
): JSX.Element;

export function $for<T>(
  items: () => T[],
  each:
    | ((item: T, index: State<number>) => JSX.Element)
    | ((item: State<T>, index: State<number>) => JSX.Element),
  getKey?: (item: T, index: number) => unknown,
  warnMissingKey = false,
  stableRow = false,
  trackIndex = true,
): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  const keyed = getKey !== undefined;
  const parentOwner = getOwner();
  let warnedAboutMissingKey = false;

  const warnAboutMissingKey = (length: number): void => {
    if (!warnMissingKey || keyed || warnedAboutMissingKey || length === 0 || !import.meta.env.DEV) {
      return;
    }

    warnedAboutMissingKey = true;
    console.warn(
      "[vynn] Each child in a list should have a unique `key` prop. " +
        "Add the same `key` expression to every root JSX element returned by `.map()` " +
        "to preserve row identity when items are reordered or replaced.",
    );
  };

  const invokeEach = each as (
    item: T | State<T>,
    index: State<number>,
  ) => JSX.Element;
  const renderEach = (item: T | State<T>, index?: State<number>): JSX.Element =>
    withDOMNamespace(namespace, () => invokeEach(item, index as State<number>));

  const createRowNode = (item: T | State<T>, index?: State<number>): JSX.Element =>
    $nodes(() => {
      // Keep each row associated with its matched item, not its current array
      // position. Reordering then moves the existing row without invoking its
      // component callback again or recreating component-local state.
      //
      // Keyed callbacks receive a reactive item cell. Replacing an object with
      // another object having the same key updates this cell while preserving
      // the row's component owner and local state.
      return renderEach(item, index);
    });

  const createRow = (
    item: T,
    identity: unknown,
    index: number,
    outputNodes: JSX.Element[],
  ): ForRow<T> => {
    // A row is a lifecycle boundary. Its renderer effects, nested components,
    // and user-created effects must not outlive the entry when it is removed.
    // Transparent owners do not consume an additional hydration identity slot.
    //
    // Keep row state on the Owner and the rendered node in the list's existing
    // output array. This avoids both a separate ForRow object and a duplicate
    // per-row node reference.
    const owner = createOwner(parentOwner, { identity: false });
    const entry = owner as ForRow<T>;
    setOwnerDisposeCallback(owner, releaseForRow);

    try {
      return runWithOwner(owner, () => {
        const indexState = trackIndex ? createStateValue(index) : undefined;
        const itemState = keyed ? createStateValue(item) : undefined;
        const renderedItem = itemState ?? item;

        entry[FOR_IDENTITY] = identity;
        entry[FOR_ITEM_STATE] = itemState;
        entry[FOR_INDEX_STATE] = indexState;
        outputNodes.push(
          stableRow
            ? renderEach(renderedItem, indexState)
            : createRowNode(renderedItem, indexState),
        );

        return entry;
      });
    } catch (cause) {
      try {
        disposeOwner(owner);
      } catch (cleanupCause) {
        throw new AggregateError(
          [cause, cleanupCause],
          "[Vynn] A list entry failed to render and its cleanup also failed.",
        );
      }
      throw cause;
    }
  };

  if (import.meta.env.SSR) {
    return $nodes(() => {
      const values = items();
      warnAboutMissingKey(values.length);

      return values.map((item, i) => {
        // List indexes are synchronous cells, not async resources. Avoid
        // allocating resource slots/controllers for every rendered item.
        const indexState = trackIndex ? createStateValue(i) : undefined;
        return keyed
          ? renderEach(createStateValue(item), indexState)
          : renderEach(item, indexState);
      });
    });
  }

  let result: JSX.Element[] = [];
  // These arrays stay aligned: row Owners retain lifecycle/key state, while
  // the output array retains their DOM/JSX nodes without duplicating references.
  let oldEntries: ForRow<T>[] = [];
  let initialized = false;

  const value = $computed(() => {
    const newItems = items();
    warnAboutMissingKey(newItems.length);

    // Subscribe to the array structure and slots so in-place store
    // reconciliation can invalidate the list when items are inserted/removed.
    const newItemsLength = newItems.length;
    for (let i = 0; i < newItemsLength; i++) {
      void newItems[i];
    }

    // Evaluate selectors while tracking. A reactive key change must trigger a
    // new reconciliation pass. The actual diff remains untracked.
    const newIdentities = keyed
      ? newItems.map((item, index) => getKey!(item, index))
      : newItems;

    if (keyed && import.meta.env.DEV) {
      const seen = new Set<unknown>();

      for (const identity of newIdentities) {
        const normalized = normalizeIdentity(identity);
        if (seen.has(normalized)) {
          console.warn(
            "[vynn] Duplicate key detected in a $for list. Keys should be unique among sibling rows.",
          );
        } else {
          seen.add(normalized);
        }
      }
    }

    untrack(() => {
      /*
       * First render.
       */
      if (!initialized) {
        const entries: ForRow<T>[] = [];
        const nodes: JSX.Element[] = [];

        try {
          for (let index = 0; index < newItems.length; index++) {
            entries.push(createRow(newItems[index], newIdentities[index], index, nodes));
          }
        } catch (cause) {
          const cleanupErrors: unknown[] = [];
          for (const entry of entries) {
            try {
              disposeOwner(entry);
            } catch (cleanupCause) {
              cleanupErrors.push(cleanupCause);
            }
          }

          if (cleanupErrors.length > 0) {
            throw new AggregateError(
              [cause, ...cleanupErrors],
              "[Vynn] A list failed to render and cleanup of earlier entries also failed.",
            );
          }
          throw cause;
        }

        oldEntries = entries;
        result = nodes;
        initialized = true;

        return;
      }

      /*
       * Index old entries by identity. Buckets preserve deterministic FIFO
       * matching for duplicate values while ensuring an entry is reused once.
       */
      const oldByIdentity = new Map<unknown, ForBucket>();

      for (let index = 0; index < oldEntries.length; index++) {
        const entry = oldEntries[index];
        const identity = normalizeIdentity(entry[FOR_IDENTITY]);
        let bucket = oldByIdentity.get(identity);

        if (!bucket) {
          bucket = { entries: [], nextIndex: 0 };
          oldByIdentity.set(identity, bucket);
        }

        bucket.entries.push(index);
      }

      const newEntries: ForRow<T>[] = [];
      const createdEntries: ForRow<T>[] = [];
      const nodes: JSX.Element[] = [];

      try {
        for (let i = 0; i < newItems.length; i++) {
          const newItem = newItems[i];
          const identity = newIdentities[i];
          const bucket = oldByIdentity.get(normalizeIdentity(identity));
          const oldIndex =
            bucket && bucket.nextIndex < bucket.entries.length
              ? bucket.entries[bucket.nextIndex++]
              : undefined;
          if (oldIndex !== undefined) {
            const entry = oldEntries[oldIndex]!;

            // Preserve the existing DOM and reactive subtree.
            entry[FOR_IDENTITY] = identity;

            // Keyed rows read the current item through this stable reactive cell.
            if (entry[FOR_ITEM_STATE]) {
              entry[FOR_ITEM_STATE].value = newItem;
            }

            if (entry[FOR_INDEX_STATE]) entry[FOR_INDEX_STATE].value = i;
            newEntries.push(entry);
            nodes.push(result[oldIndex]!);
          } else {
            const created = createRow(newItem, identity, i, nodes);
            createdEntries.push(created);
            newEntries.push(created);
          }
        }
      } catch (cause) {
        const cleanupErrors: unknown[] = [];
        for (const entry of createdEntries) {
          try {
            disposeOwner(entry);
          } catch (cleanupCause) {
            cleanupErrors.push(cleanupCause);
          }
        }

        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [cause, ...cleanupErrors],
            "[Vynn] A list update failed and cleanup of newly created entries also failed.",
          );
        }
        throw cause;
      }

      // Entries not consumed from the identity buckets no longer belong to
      // the rendered list. Dispose their complete reactive subtree now rather
      // than leaving its effects attached to the parent component owner.
      const removedEntries: ForRow<T>[] = [];
      for (const bucket of oldByIdentity.values()) {
        for (let index = bucket.nextIndex; index < bucket.entries.length; index++) {
          removedEntries.push(oldEntries[bucket.entries[index]]!);
        }
      }

      oldEntries = newEntries;
      result = nodes;

      const cleanupErrors: unknown[] = [];
      for (const entry of removedEntries) {
        try {
          disposeOwner(entry);
        } catch (cause) {
          cleanupErrors.push(cause);
        }
      }

      if (cleanupErrors.length === 1) throw cleanupErrors[0];
      if (cleanupErrors.length > 1) {
        throw new AggregateError(
          cleanupErrors,
          "[Vynn] Multiple removed list entry cleanups failed.",
        );
      }
    });

    return result;
  });

  return $nodes(() => value.value);
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (a === null || b === null) {
    return false;
  }

  if (typeof a !== "object") {
    return false;
  }

  if (typeof b !== "object") {
    return false;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) {
      return false;
    }

    for (const [keyA, valueA] of a) {
      let found = false;

      for (const [keyB, valueB] of b) {
        if (isEqual(keyA, keyB) && isEqual(valueA, valueB)) {
          found = true;
          break;
        }
      }

      if (!found) {
        return false;
      }
    }

    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }

    for (const valueA of a) {
      let found = false;

      for (const valueB of b) {
        if (isEqual(valueA, valueB)) {
          found = true;
          break;
        }
      }

      if (!found) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }

    if (
      !isEqual((a as Record<PropertyKey, unknown>)[key], (b as Record<PropertyKey, unknown>)[key])
    ) {
      return false;
    }
  }

  return true;
}
