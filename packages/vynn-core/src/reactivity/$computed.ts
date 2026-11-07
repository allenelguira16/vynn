import { createAsyncDerived } from "./$async";
import { isAsyncFunction } from "./is-async-function";
import { isPending as getPending, registerPending } from "./pending";

export type Computed<T> = {
  readonly value: T;
};

/**
 * Creates a read-only reactive value derived from other reactive values.
 *
 * Synchronous getters retain the existing lazy behavior. Passing an async
 * function creates an eager async-derived value whose dependencies are
 * tracked before the first await. The last resolved value remains available
 * while a replacement computation is pending.
 *
 * @template T The computed value type.
 * @param getter A synchronous or asynchronous derivation.
 * @returns A read-only reactive value containing the derived result.
 */
export function $computed<T>(getter: () => Promise<T>): Computed<T>;
export function $computed<T>(getter: () => T): Computed<T>;
export function $computed<T>(getter: () => T | Promise<T>): Computed<T> {
  if (!isAsyncFunction(getter)) {
    return {
      get value() {
        return getter() as T;
      },
    };
  }

  const derived = createAsyncDerived(getter as () => Promise<T>);
  const computed: Computed<T> = {
    get value() {
      return derived.value;
    },
  };

  registerPending(computed, () => getPending(derived));

  return computed;
}
