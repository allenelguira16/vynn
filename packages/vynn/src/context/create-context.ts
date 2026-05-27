import { JSX } from "~/types/jsx";

/**
 * Create Context helper
 *
 * @returns Provider and context
 */
export function createContext<T>() {
  let value: T;

  function Provider(props: { value: T; children: () => JSX.Element }) {
    value = props.value;
    return props.children;
  }

  function getContext(): T {
    if (!value) {
      throw new Error("No provider found for context.");
    }
    return value;
  }

  return [Provider, getContext] as const;
}
