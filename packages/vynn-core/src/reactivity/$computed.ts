import { getAsyncBoundary } from "../context/async-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $renderEffect } from "./$effect";
import { $state } from "./$state";
import { createAsyncDerived } from "./async";
import { isAsyncFunction } from "./is-async-function";
import { NotReadyError } from "./not-ready-error";
import { isPending as getPending, registerPending } from "./pending";
import { markRef, type VynnReadonlyRef } from "./ref";

export type Computed<T> = VynnReadonlyRef<T>;

export type ComputedOptions = {
  /**
   * Defer the initial evaluation until the computed value is first read.
   */
  lazy?: boolean;
};

/**
 * Creates a read-only reactive value derived from other reactive values.
 *
 * Synchronous getters use a render effect and do not consume async hydration
 * identities. Async-function getters use the async resource implementation,
 * retaining their last resolved value while refreshing and participating in
 * Await boundaries.
 *
 * Declare asynchronous getters with the async keyword. Vynn's lazy loader also
 * marks its Promise-returning getter so it can use the async resource path.
 *
 * @template T The computed value type.
 * @param getter A synchronous or asynchronous derivation.
 * @returns A read-only reactive value containing the derived result.
 */
export function $computed<T>(getter: () => Promise<T>, options?: ComputedOptions): Computed<T>;
export function $computed<T>(getter: () => T, options?: ComputedOptions): Computed<T>;
export function $computed<T>(
  getter: () => T | Promise<T>,
  options: ComputedOptions = {},
): Computed<T> {
  const lazy = options.lazy ?? false;

  if (isAsyncFunction(getter) || isAsyncGetterFromLazy(getter)) {
    const derived = createAsyncDerived(getter as () => Promise<T>, lazy);
    const computed = markRef({
      get value() {
        return derived.value;
      },
    }) as Computed<T>;

    registerPending(computed, () => getPending(derived));
    return computed;
  }

  const resolve = $state<T>();
  const owner = getOwner();
  let initialized = false;
  let hasValue = false;
  let pendingError: NotReadyError | undefined;
  const pending = $state(false);

  const initialize = () => {
    if (initialized) return;
    initialized = true;

    runWithOwner(owner, () =>
      $renderEffect(() => {
        pendingError = undefined;
        pending.value = false;

        try {
          resolve.value = getter() as T;
          hasValue = true;
        } catch (error) {
          // A synchronous computed can depend on an async resource. Keep the
          // previous value while it refreshes, and expose the pending promise
          // when the computed has not produced its first value yet.
          if (error instanceof NotReadyError) {
            pendingError = error;
            pending.value = true;
            return;
          }

          throw error;
        }
      }),
    );
  };

  if (!lazy) initialize();

  const computed = markRef({
    get value() {
      initialize();

      // Read the backing cell before checking pending state so consumers of
      // this computed also subscribe and rerun when the first value arrives.
      const currentValue = resolve.value as T;

      if (pendingError && !hasValue) {
        const boundary = getAsyncBoundary();

        // The dependency may already have registered this exact promise with
        // the same boundary while the computed's render effect was running.
        if (boundary && boundary !== pendingError.boundary) {
          boundary(pendingError.promise);
        }

        throw new NotReadyError(
          pendingError.promise,
          boundary ?? pendingError.boundary,
        );
      }

      return currentValue;
    },
  }) as Computed<T>;

  registerPending(computed, () => pending.value);

  return computed;
}
