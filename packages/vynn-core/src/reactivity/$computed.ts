import { createAsyncDerived } from "./$async";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $renderEffect } from "./$effect";
import { $state } from "./$state";
import { isAsyncFunction } from "./is-async-function";
import { isPending as getPending, registerPending } from "./pending";

export type Computed<T> = {
  readonly value: T;
};

export type ComputedOptions = {
  /**
   * Defer the initial evaluation until the computed value is first read.
   */
  lazy?: boolean;
};

/**
 * Creates a read-only reactive value derived from other reactive values.
 *
 * By default, the initial computation runs immediately. Setting lazy to true
 * defers that first evaluation until the value is read. After initialization,
 * both modes track dependencies and update reactively.
 *
 * Async getters retain their last resolved value while refreshing. Pending
 * reads participate in the nearest Await boundary.
 *
 * @template T The computed value type.
 * @param getter A synchronous or asynchronous derivation.
 * @returns A read-only reactive value containing the derived result.
 */
export function $computed<T>(
  getter: () => Promise<T>,
  options?: ComputedOptions,
): Computed<T>;
export function $computed<T>(getter: () => T, options?: ComputedOptions): Computed<T>;
export function $computed<T>(
  getter: () => T | Promise<T>,
  options: ComputedOptions = {},
): Computed<T> {
  const lazy = options.lazy ?? false;

  if (!isAsyncFunction(getter)) {
    const resolve = $state<T>();
    const owner = getOwner();
    let initialized = false;

    const initialize = () => {
      if (initialized) return;
      initialized = true;

      runWithOwner(owner, () =>
        $renderEffect(() => {
          resolve.value = getter() as T;
        }),
      );
    };

    if (!lazy) initialize();

    return {
      get value() {
        initialize();
        return resolve.value as T;
      },
    };
  }

  const derived = createAsyncDerived(getter as () => Promise<T>, lazy);
  const computed: Computed<T> = {
    get value() {
      return derived.value;
    },
  };

  registerPending(computed, () => getPending(derived));

  return computed;
}
