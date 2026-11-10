import { createAsyncDerived } from "./async";
import { isPending as getPending, registerPending } from "./pending";
import { markRef, type VynnReadonlyRef } from "./ref";

export type Computed<T> = VynnReadonlyRef<T>;

export type ComputedOptions = {
  /** Defer the initial evaluation until the computed value is first read. */
  lazy?: boolean;
};

/**
 * Creates a read-only reactive value derived from other reactive values.
 *
 * The getter may return a value or a Promise. Promise-returning getters are
 * detected from their result, so ordinary callbacks work without requiring
 * async-function syntax. Async computations retain their last resolved value
 * while refreshing.
 */
export function $computed<T>(getter: () => Promise<T>, options?: ComputedOptions): Computed<T>;
export function $computed<T>(getter: () => T, options?: ComputedOptions): Computed<T>;
export function $computed<T>(
  getter: () => T | Promise<T>,
  options: ComputedOptions = {},
): Computed<T> {
  const derived = createAsyncDerived<T>(getter, options.lazy ?? false);
  const computed = markRef({
    get value() {
      return derived.value;
    },
  }) as Computed<T>;

  registerPending(computed, () => getPending(derived));
  return computed;
}
