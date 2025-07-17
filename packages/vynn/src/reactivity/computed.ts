import { $effect } from "./effect";
import { $state } from "./state";

export type Computed<T> = {
  readonly value: T;
};

/**
 * Create a computed value
 *
 * @param getter - The getter function that returns the computed value from a reactive value.
 * @returns The computed value.
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
