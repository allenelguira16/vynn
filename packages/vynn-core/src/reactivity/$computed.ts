import { $state } from "./$state";
import { $effect } from "./$effect";

export type Computed<T> = {
  readonly value: T;
};

/**
 * Creates a read-only reactive value derived from other reactive values.
 *
 * The getter is re-evaluated when its dependencies change.
 *
 * @template T The computed value type.
 * @param getter A function that returns the derived value.
 * @returns A read-only reactive value containing the result of the getter.
 */
export function $computed<T>(getter: () => T): Computed<T> {
  const result = $state<T>();

  $effect(() => {
    result.value = getter();
  });

  return {
    get value() {
      return result.value as T;
    },
  };
}
