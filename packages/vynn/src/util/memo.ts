import { clientStreamContext } from "~/context/stream-context";

export type MemoState<P, T> = { lastProps?: P; hasLast: boolean; lastResult?: T };

/**
 * memoize a function
 *
 * @param fn - The function to memoize.
 * @returns The memoized function.
 */
export function memo<T>(fn: () => T): () => T;
export function memo<P extends object, T>(fn: (props: P) => T): (props: P) => T;
export function memo<P, T>(fn: (props?: P) => T) {
  // wrapper will be the key in memoStore
  const wrapper = ((props?: P) => {
    const memoStore = clientStreamContext().memo;

    let state = memoStore.get(wrapper) as MemoState<P, T> | undefined;
    if (!state) {
      state = { lastProps: undefined, hasLast: false, lastResult: undefined };
      memoStore.set(wrapper, state);
    }

    // compare only if we have a previous value (handles undefined props correctly)
    if (state.hasLast && isEqual(state.lastProps, props)) {
      return state.lastResult as T;
    }

    // compute + store
    state.lastProps = props;
    state.lastResult = fn(props);
    state.hasLast = true;
    return state.lastResult as T;
  }) as (props?: P) => T;

  return wrapper;
}

export function isEqual(a: any, b: any): boolean {
  if (a === b) return true;

  // Handle NaN
  if (a !== a && b !== b) return true;

  // Handle null or undefined
  if (a == null || b == null) return false;

  // Handle Date
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle RegExp
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Handle Array
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle plain objects
  if (
    typeof a === "object" &&
    typeof b === "object" &&
    a.constructor === Object &&
    b.constructor === Object
  ) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!isEqual(a[key], b[key])) return false;
    }
    return true;
  }

  // Everything else (functions, class instances, etc.)
  return false;
}
