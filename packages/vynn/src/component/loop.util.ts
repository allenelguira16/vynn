import { $state, type State } from "~/reactivity/state";

export function mapArray<T>(
  list: () => readonly T[],
  mapFn: (item: T, index: State<number>) => Node,
) {
  let items: { index: State<number>; value: T; element: Node }[] = [];

  return () => {
    const arr = list() || [];
    const len = arr.length;
    const newItems: typeof items = new Array(len);
    const oldIndexMap = new Map<T, number[]>();

    // Build index map for old items (handle duplicates by storing arrays of indices)
    for (let i = 0; i < items.length; i++) {
      const key = items[i].value;
      if (!oldIndexMap.has(key)) oldIndexMap.set(key, []);
      oldIndexMap.get(key)!.push(i);
    }

    // Match new array to old array
    const newToOld = new Array(len).fill(-1);
    for (let i = 0; i < len; i++) {
      const value = arr[i];
      const oldIndices = oldIndexMap.get(value);
      if (oldIndices && oldIndices.length) {
        const oldIndex = oldIndices.shift()!;
        newToOld[i] = oldIndex;
        newItems[i] = items[oldIndex];
      } else {
        // Create new element if not found
        const idxState = $state(i);
        const element = mapFn(value, idxState);
        newItems[i] = { value, index: idxState, element };
      }
    }

    // Remove any old items not reused
    // for (let i = 0; i < items.length; i++) {
    //   if (!newToOld.includes(i)) {
    //     const el = items[i].element;
    //     el.parentNode?.removeChild(el);
    //   }
    // }

    // Compute LIS to minimize moves
    const seq = longestIncreasingSubsequence(newToOld);

    // Apply moves in reverse to avoid messing up DOM order
    let seqIdx = seq.length - 1;
    for (let i = len - 1; i >= 0; i--) {
      const item = newItems[i];
      if (newToOld[i] === -1 || i !== seq[seqIdx]) {
        // Insert/move node
        const anchor = i + 1 < len ? newItems[i + 1].element : null;
        item.element.parentNode?.insertBefore(item.element, anchor);
      } else {
        seqIdx--;
      }
      item.index.value = i; // update reactive index
    }

    items = newItems;
    return items.map((it) => it.element);
  };
}

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
      if (arr[result[c]] < n) u = c + 1;
      else v = c;
    }
    if (n < arr[result[u]]) {
      if (u > 0) p[i] = result[u - 1];
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
