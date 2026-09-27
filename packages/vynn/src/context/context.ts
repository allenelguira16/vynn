import { JSX } from "../jsx";
import { getOwnerContext, setOwnerContext } from "../life-cycle/owner";

/**
 * Creates a context provider component and its corresponding consumer hook.
 *
 * @returns A tuple containing [Provider, useContext].
 */
export function createContext<T>() {
  const id = Symbol();

  function Provider(props: { value: T; children: JSX.Element }) {
    setOwnerContext(id, props.value);
    return props.children;
  }

  function useContext() {
    const value = getOwnerContext<T>(id);

    if (value === undefined || value === null) {
      throw new Error("Context used without wrapping it in its Provider");
    }

    return value;
  }

  return [Provider, useContext] as const;
}
