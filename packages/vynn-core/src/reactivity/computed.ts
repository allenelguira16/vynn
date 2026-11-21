import { getAsyncBoundary } from "../context/async-context";
import { getErrorBoundary } from "../context/error-boundary-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import {
  cleanupSubscriber,
  track,
  trigger,
  withSubscriber,
  type ReactiveSubscriber,
} from "./graph";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { markRef, type VynnReadonlyRef } from "./ref";
import { createAsyncResource } from "./resource";
import { isAsyncFunction } from "./utils";

export type Computed<T> = VynnReadonlyRef<T>;

export function $computed<T>(getter: () => Promise<T>): Computed<T>;
export function $computed<T>(getter: () => T): Computed<T>;
export function $computed<T>(getter: () => T | Promise<T>): Computed<T> {
  if (typeof getter !== "function") {
    throw new TypeError("[vynn]: $computed() requires a getter function.");
  }

  if (isAsyncFunction(getter) || isAsyncGetterFromLazy(getter)) {
    const resource = createAsyncResource(getter as () => Promise<T>);

    const computed = markRef({
      get value(): T {
        return resource.value;
      },
    }) as Computed<T>;

    registerPending(computed, () => isPending(resource));
    return computed;
  }

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

      if (isPromiseLikeValue(nextValue)) {
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

function isPromiseLikeValue(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
