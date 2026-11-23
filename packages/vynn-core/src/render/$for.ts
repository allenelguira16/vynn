import type { JSX } from "../types/jsx";


import { $computed } from "../reactivity/computed";
import { untrack } from "../reactivity/effect";
import { $state, createStateValue, type State } from "../reactivity/state";
import { $nodes } from "./$nodes";
import { getCurrentDOMNamespace, withDOMNamespace } from "./namespace";

type ForEntry<T> = {
  identity: unknown;
  itemState?: State<T>;
  node: JSX.Element;
  index: State<number>;
};

type ForBucket<T> = {
  entries: ForEntry<T>[];
  nextIndex: number;
};

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

export function $for<T>(
  items: () => T[],
  each:
    | ((item: T, index: State<number>) => JSX.Element)
    | ((item: State<T>, index: State<number>) => JSX.Element),
  getKey?: (item: T, index: number) => unknown,
  warnMissingKey = false,
): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  const keyed = getKey !== undefined;
  let warnedAboutMissingKey = false;

  const warnAboutMissingKey = (length: number): void => {
    if (!warnMissingKey || keyed || warnedAboutMissingKey || length === 0 || !import.meta.env.DEV) {
      return;
    }

    warnedAboutMissingKey = true;
    console.warn(
      "[vynn] Each child in a list should have a unique `key` prop. " +
        "Add `key` to the root JSX element returned by `.map()` to preserve row identity " +
        "when items are reordered or replaced.",
    );
  };

  const invokeEach = each as (
    item: T | State<T>,
    index: State<number>,
  ) => JSX.Element;
  const renderEach = (item: T | State<T>, index: State<number>): JSX.Element =>
    withDOMNamespace(namespace, () => invokeEach(item, index));

  const createRowNode = (item: T | State<T>, index: State<number>): JSX.Element =>
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

  if (import.meta.env.SSR) {
    return $nodes(() => {
      const values = items();
      warnAboutMissingKey(values.length);

      return values.map((item, i) => {
        const indexState = $state(() => i);
        return keyed
          ? renderEach(createStateValue(item), indexState)
          : renderEach(item, indexState);
      });
    });
  }

  let result: JSX.Element[] = [];
  let oldEntries: ForEntry<T>[] = [];
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
        const entries = newItems.map((item, index) => {
          const indexState = $state(() => index);
          const itemState = keyed ? createStateValue(item) : undefined;
          const renderedItem = itemState ?? item;

          return {
            identity: newIdentities[index],
            itemState,
            node: createRowNode(renderedItem, indexState),
            index: indexState,
          };
        });

        oldEntries = entries;
        result = entries.map((entry) => entry.node);
        initialized = true;

        return;
      }

      /*
       * Index old entries by identity. Buckets preserve deterministic FIFO
       * matching for duplicate values while ensuring an entry is reused once.
       */
      const oldByIdentity = new Map<unknown, ForBucket<T>>();

      for (const entry of oldEntries) {
        const identity = normalizeIdentity(entry.identity);
        let bucket = oldByIdentity.get(identity);

        if (!bucket) {
          bucket = { entries: [], nextIndex: 0 };
          oldByIdentity.set(identity, bucket);
        }

        bucket.entries.push(entry);
      }

      const newEntries: ForEntry<T>[] = [];

      for (let i = 0; i < newItems.length; i++) {
        const newItem = newItems[i];
        const identity = newIdentities[i];
        const bucket = oldByIdentity.get(normalizeIdentity(identity));
        const entry =
          bucket && bucket.nextIndex < bucket.entries.length
            ? bucket.entries[bucket.nextIndex++]
            : undefined;

        if (entry) {
          // Preserve the existing DOM and reactive subtree.
          entry.identity = identity;

          // Keyed rows read the current item through this stable reactive cell.
          if (entry.itemState) {
            entry.itemState.value = newItem;
          }

          entry.index.value = i;
          newEntries.push(entry);
        } else {
          const indexState = $state(() => i);
          const itemState = keyed ? createStateValue(newItem) : undefined;
          const renderedItem = itemState ?? newItem;

          newEntries.push({
            identity,
            itemState,
            node: createRowNode(renderedItem, indexState),
            index: indexState,
          });
        }
      }

      oldEntries = newEntries;
      result = newEntries.map((entry) => entry.node);
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
