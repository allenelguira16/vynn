import { JSX } from "~/types";

const map = new WeakMap<symbol, any>();

/**
 * Create Context helper
 *
 * @returns Provider and context
 */
export function createContext<T>() {
  const id = Symbol("context");

  function Provider(props: { value: T; children: () => JSX.Element }) {
    map.set(id, props.value);
    return props.children();
  }

  function getContext(): T {
    const value = map.get(id);
    if (!value) {
      throw new Error("No provider found for context.");
    }

    return value;
  }

  return [Provider, getContext] as const;
}
