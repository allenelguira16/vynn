import type { JSX } from "../types/jsx";

import { isServer } from "../context/is-server-context";
import { $computed } from "../reactivity_new/computed";
import { untrack } from "../reactivity_new/effect";
import { $state, type State } from "../reactivity_new/state";
import { $nodes } from "./$nodes";
import { getCurrentDOMNamespace, withDOMNamespace } from "./namespace";

type ForEntry<T> = {
  item: T;
  node: JSX.Element;
  index: State<number>;
};

export function $for<T>(
  items: () => T[],
  each: (item: T, index: State<number>) => JSX.Element,
): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  const renderEach = (item: T, index: State<number>): JSX.Element =>
    withDOMNamespace(namespace, () => each(item, index));

  const createRowNode = (item: T, index: State<number>): JSX.Element =>
    $nodes(() => {
      // Keep each row associated with its matched item, not its current array
      // position. Reordering then moves the existing row without invoking its
      // component callback again or recreating component-local state.
      //
      // Reactive reads performed by the callback remain tracked here. When an
      // item is mutated in place (for example, by async-store reconciliation),
      // only the row that reads the changed property is refreshed.
      return renderEach(item, index);
    });

  if (isServer()) {
    return $nodes(() =>
      items().map((item, i) =>
        renderEach(
          item,
          $state(() => i),
        ),
      ),
    );
  }

  // const result = $state<JSX.Element[]>([]);
  let result: JSX.Element[] = [];
  let oldEntries: ForEntry<T>[] = [];
  let initialized = false;

  const value = $computed(() => {
    const newItems = items();

    // The diff below is intentionally untracked, but the list itself must
    // subscribe to its array structure and slots. Otherwise in-place store
    // reconciliation can invalidate individual rows without updating the
    // parent list to remove rows whose indexes no longer exist.
    const newItemsLength = newItems.length;
    for (let i = 0; i < newItemsLength; i++) {
      void newItems[i];
    }

    untrack(() => {
      /*
       * First render.
       */
      if (!initialized) {
        const entries = newItems.map((value, index) => {
          const indexState = $state(() => index);

          return {
            item: value,
            node: createRowNode(value, indexState),
            index: indexState,
          };
        });

        oldEntries = entries;
        result = entries.map((entry) => entry.node);
        initialized = true;

        return;
      }

      /*
       * Each old entry may only be reused once.
       *
       * This is what fixes:
       *
       *   [A, A] -> [A, A]
       *
       * from becoming:
       *
       *   [oldA, oldA]
       */
      const used = new Set<number>();
      const newEntries: ForEntry<T>[] = [];

      for (let i = 0; i < newItems.length; i++) {
        const newItem = newItems[i];

        let oldIndex = -1;

        for (let j = 0; j < oldEntries.length; j++) {
          if (used.has(j)) {
            continue;
          }

          if (Object.is(newItem, oldEntries[j].item)) {
            oldIndex = j;
            break;
          }
        }

        if (oldIndex >= 0) {
          const entry = oldEntries[oldIndex];

          used.add(oldIndex);

          /*
           * Preserve the existing DOM and reactive subtree.
           */
          entry.item = newItem;

          /*
           * Preserve the State object, but update its value.
           */
          entry.index.value = i;

          newEntries.push(entry);
        } else {
          /*
           * Completely new item.
           */
          const indexState = $state(() => i);

          newEntries.push({
            item: newItem,
            node: createRowNode(newItem, indexState),
            index: indexState,
          });
        }
      }

      oldEntries = newEntries;

      /*
       * Result now contains the exact existing nodes in the new order.
       */
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
