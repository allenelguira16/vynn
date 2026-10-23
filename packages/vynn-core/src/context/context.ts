import { JSX } from "../types/jsx";
import { getContext, setContext } from "../life-cycle/owner";

/**
 * Creates a context provider and its corresponding consumer hook.
 *
 * The returned provider makes a value available to descendants, while the
 * consumer hook retrieves the nearest value associated with this context.
 *
 * @template T The type of the context value.
 * @returns A readonly tuple containing the `Provider` component and `useContext` hook.
 */
export function createContext<T>() {
  const id = Symbol();

  function Provider(props: { value: T; children: JSX.Element }) {
    setContext(id, props.value);
    return props.children;
  }

  function useContext() {
    const value = getContext<T>(id);

    if (value === undefined || value === null) {
      throw new Error("Context used without wrapping it in its Provider");
    }

    return value;
  }

  return [Provider, useContext] as const;
}
