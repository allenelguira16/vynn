import type { JSX } from "../../types/jsx";
import { $computed } from "../../reactivity/computed";
import { untrack } from "../../reactivity/effect";
import { $state, type State } from "../../reactivity/state";
import { $nodes } from "./$nodes";
import { getCurrentDOMNamespace, withDOMNamespace } from "../namespace";

type ForEntry<T> = { item: T; node: JSX.Element; index: State<number> };

export function $for<T>(items: () => T[], each: (item: T, index: State<number>) => JSX.Element): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  const renderEach = (item: T, index: State<number>): JSX.Element => withDOMNamespace(namespace, () => each(item, index));
  const createRowNode = (item: T, index: State<number>): JSX.Element => $nodes(() => renderEach(item, index));
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