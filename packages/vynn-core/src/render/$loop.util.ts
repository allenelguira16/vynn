import { $state, type State } from "../reactivity/$state";

/**
 * Creates a reactive list mapper that reuses previously rendered items.
 *
 * Items are matched by value so existing DOM nodes can be reused when the
 * list changes. Each item keeps a reactive index that is updated when its
 * position changes.
 *
 * The returned function computes the current mapped items and minimizes DOM
 * moves using the longest increasing subsequence of reused item positions.
 *
 * @template T The type of each list item.
 * @param list A function that returns the current list of items.
 * @param mapFn A function that creates a DOM node for each item.
 * @returns A function that maps the current list to its rendered DOM nodes.
 */
export function mapArray<T>(
  list: () => readonly T[],
  mapFn: (item: T, index: State<number>) => Node,
) {
  let items: {
    index: State<number>;
    value: T;
    element: Node;
  }[] = [];

  return () => {
    const arr = list() || [];
    const len = arr.length;
    const newItems: typeof items = new Array(len);

    const oldIndexMap = new Map<T, number[]>();

    // Build an index map for old items.
    // Arrays of indices allow duplicate values to be matched independently.
    for (let i = 0; i < items.length; i++) {
      const key = items[i].value;

      if (!oldIndexMap.has(key)) {
        oldIndexMap.set(key, []);
      }

      oldIndexMap.get(key)!.push(i);
    }

    // Match each new item to an existing item when possible.
    const newToOld = new Array(len).fill(-1);

    for (let i = 0; i < len; i++) {
      const value = arr[i];
      const oldIndices = oldIndexMap.get(value);

      if (oldIndices && oldIndices.length) {
        const oldIndex = oldIndices.shift()!;

        newToOld[i] = oldIndex;
        newItems[i] = items[oldIndex];
      } else {
        // Create a new item when no reusable item exists.
        const idxState = $state(i);
        const element = mapFn(value, idxState);

        newItems[i] = {
          value,
          index: idxState,
          element,
        };
      }
    }

    // Compute the longest increasing subsequence of reused items.
    // Items in this sequence can remain in their current DOM order.
    const seq = longestIncreasingSubsequence(newToOld);

    // Process items in reverse so each item can use the next item as its anchor.
    let seqIdx = seq.length - 1;

    for (let i = len - 1; i >= 0; i--) {
      const item = newItems[i];

      if (newToOld[i] === -1 || i !== seq[seqIdx]) {
        const anchor = i + 1 < len ? newItems[i + 1].element : null;

        // Insert new nodes or move reused nodes into their new position.
        item.element.parentNode?.insertBefore(item.element, anchor);
      } else {
        seqIdx--;
      }

      // Keep the item's index reactive as its position changes.
      item.index.value = i;
    }

    items = newItems;

    return items.map((it) => it.element);
  };
}

/**
 * Finds the indexes forming the longest increasing subsequence.
 *
 * The returned indexes refer to positions in the input array. Negative values
 * are ignored because they represent newly created items rather than reused
 * items.
 *
 * @param arr The sequence of previous item indexes.
 * @returns The indexes that form the longest increasing subsequence.
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  const p = arr.slice();
  const result: number[] = [];

  let u: number, v: number;

  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];

    if (n < 0) continue;

    if (result.length === 0 || arr[result[result.length - 1]] < n) {
      p[i] = result.length > 0 ? result[result.length - 1] : -1;

      result.push(i);
      continue;
    }

    u = 0;
    v = result.length - 1;

    while (u < v) {
      const c = ((u + v) / 2) | 0;

      if (arr[result[c]] < n) {
        u = c + 1;
      } else {
        v = c;
      }
    }

    if (n < arr[result[u]]) {
      if (u > 0) {
        p[i] = result[u - 1];
      }

      result[u] = i;
    }
  }

  u = result.length;
  v = result[u - 1];

  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  return result;
}
