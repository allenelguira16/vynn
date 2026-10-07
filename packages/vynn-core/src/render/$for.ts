import { JSX } from "../types/jsx";
import { $effect } from "../reactivity/$effect";
import { $state, State } from "../reactivity/$state";
import { $dyn } from "./$dyn";
import { untrack } from "../reactivity/untrack";
import { IS_SERVER_ENV } from "../utils/is-server-env";

type ForEntry<T> = {
  item: T;
  node: JSX.Element;
  index: State<number>;
};

export function $for<T>(
  items: () => T[],
  each: (item: T, index: State<number>) => JSX.Element,
): JSX.Element {
  if (IS_SERVER_ENV) {
    return items().map((item, i) => each(item, { value: i }));
  }

  const result = $state<JSX.Element[]>([]);
  let oldEntries: ForEntry<T>[] = [];
  let initialized = false;

  $effect(() => {
    const newItems = items();

    untrack(() => {
      /*
       * First render.
       */
      if (!initialized) {
        const entries = newItems.map((value, index) => {
          const indexState = $state(index);

          return {
            item: value,
            node: each(value, indexState),
            index: indexState,
          };
        });

        oldEntries = entries;
        result.value = entries.map((entry) => entry.node);
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

          if (isEqual(newItem, oldEntries[j].item)) {
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
          const indexState = $state(i);

          newEntries.push({
            item: newItem,
            node: each(newItem, indexState),
            index: indexState,
          });
        }
      }

      oldEntries = newEntries;

      /*
       * Result now contains the exact existing nodes in the new order.
       */
      result.value = newEntries.map((entry) => entry.node);
    });
  });

  return $dyn(() => result.value);
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
      !isEqual(
        (a as Record<PropertyKey, unknown>)[key],
        (b as Record<PropertyKey, unknown>)[key],
      )
    ) {
      return false;
    }
  }

  return true;
}
