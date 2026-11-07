import { createAsyncDerived } from "./$async";
import { createCell } from "./cell";
import { isAsyncFunction } from "./is-async-function";

export type State<T> = {
  value: T;
};

/**
 * Creates a reactive state value.
 *
 * Passing an async function creates writable async-derived state. Reactive
 * dependencies read before the first await trigger a refresh. The latest
 * resolved value remains writable through the same `value` property.
 *
 * Ordinary values, including synchronous function values, remain ordinary
 * state.
 *
 * @template T The state value type.
 * @param initialValue The initial value or async initializer.
 * @returns A reactive state object containing the current value.
 */
export function $state<T>(initialValue: () => Promise<T>): State<T>;

export function $state<T>(initialValue: T): State<T>;

export function $state<T = undefined>(): State<T | undefined>;

export function $state<T>(
  initialValue?: T | (() => Promise<T>),
): State<T | undefined> {
  if (isAsyncFunction(initialValue)) {
    return createAsyncDerived(initialValue as () => Promise<T>) as unknown as State<T | undefined>;
  }

  return createCell(initialValue) as unknown as State<T | undefined>;
}
