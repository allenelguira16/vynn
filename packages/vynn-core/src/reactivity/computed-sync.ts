import { getAsyncBoundary } from "../context/async-boundary";
import { getErrorBoundary } from "../context/error-boundary-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import {
  cleanupSubscriber,
  track,
  trigger,
  withSubscriber,
  type ReactiveSubscriber,
} from "./graph";
import { NotReadyError } from "./not-ready-error";
import { registerPending } from "./pending";
import { markRef, type VynnReadonlyRef } from "./ref";
import { isPromiseLike } from "./utils";

export type Computed<T> = VynnReadonlyRef<T>;

/**
 * Synchronous computed implementation used by the compiler when the getter
 * is statically known to be a non-async function.
 *
 * Keep this entry free from resource, hydration, and async-context imports.
 */
export function $computedSync<T>(getter: () => T): Computed<T> {
  const owner = getOwner();
  const target = {};
  let value: T;
  let hasValue = false;
  let dirty = true;
  let pendingError: NotReadyError | undefined;

  const computation: ReactiveSubscriber = {
    dependencies: [],
    disposed: false,
    notify() {
      if (dirty || computation.disposed) return;
      dirty = true;
      trigger(target, "value");
    },
  };

  function evaluate(): void {
    if (!dirty || computation.disposed) return;

    dirty = false;
    cleanupSubscriber(computation);

    try {
      const nextValue = runWithOwner(owner, () =>
        withSubscriber(computation, () => getter() as T),
      );

      if (isPromiseLike(nextValue)) {
        throw new TypeError(
          "[vynn]: An asynchronous $computed() getter must be declared with the async keyword.",
        );
      }

      pendingError = undefined;

      if (!hasValue || !Object.is(value, nextValue)) {
        value = nextValue;
        hasValue = true;
      }
    } catch (error) {
      if (error instanceof NotReadyError) {
        pendingError = error;
        return;
      }

      dirty = true;

      const boundary = runWithOwner(owner, () => getErrorBoundary());
      if (error instanceof Error && boundary) {
        boundary(error);
        return;
      }

      throw error;
    }
  }

  const computed = markRef({
    get value(): T {
      track(target, "value");

      if (dirty) evaluate();

      if (pendingError) {
        const boundary = getAsyncBoundary();
        boundary?.(pendingError.promise);

        throw new NotReadyError(pendingError.promise, boundary ?? pendingError.boundary);
      }

      return value;
    },
  }) as Computed<T>;

  if (owner) {
    owner.cleanups.push(() => {
      computation.disposed = true;
      cleanupSubscriber(computation);
    });
  }

  // Keep the existing eager evaluation contract for synchronous getters.
  evaluate();

  registerPending(computed, () => {
    if (import.meta.env.SSR && pendingError) {
      void computed.value;
    }

    return pendingError !== undefined;
  });

  return computed;
}
