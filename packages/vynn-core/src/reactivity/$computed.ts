import { createAsyncDerived } from "./$async";
import { $renderEffect } from "./$effect";
import { $state } from "./$state";
import { isAsyncFunction } from "./is-async-function";
import { isPending as getPending, registerPending } from "./pending";

export type Computed<T> = {
  readonly value: T;
};

export type ComputedOptions = {
  /** Keep an asynchronous computation outside streaming SSR Await boundaries. */
  blockSSR?: boolean;
};

/**
 * Creates an eager read-only reactive value derived from other reactive values.
 *
 * Synchronous getters are memoized and rerun when dependencies change.
 * Async getters create an eager async-derived value that tracks dependencies
 * before the first await and retains its last resolved value during refresh.
 *
 * @template T The computed value type.
 * @param getter A synchronous or asynchronous derivation.
 * @param options Configuration for async computation behavior during SSR.
 * @returns A read-only reactive value containing the derived result.
 */
export function $computed<T>(getter: () => Promise<T>, options?: ComputedOptions): Computed<T>;
export function $computed<T>(getter: () => T, options?: ComputedOptions): Computed<T>;
export function $computed<T>(
  getter: () => T | Promise<T>,
  options: ComputedOptions = {},
): Computed<T> {
  if (!isAsyncFunction(getter)) {
    const resolve = $state<T>();

    $renderEffect(() => {
      resolve.value = getter() as T;
    });

    return {
      get value() {
        return resolve.value as T;
      },
    };
  }

  const derived = createAsyncDerived(getter as () => Promise<T>, options.blockSSR);
  const computed: Computed<T> = {
    get value() {
      return derived.value;
    },
  };

  registerPending(computed, () => getPending(derived));

  return computed;
}
