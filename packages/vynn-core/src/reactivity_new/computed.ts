import { getAsyncBoundary } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import { NotReadyError } from "./not-ready-error";
import { createReactiveEffect, track, trigger } from "./effect";
import { isPending, registerPending } from "./pending";
import { createAsyncResource } from "./resource";
import { markRef, type VynnReadonlyRef } from "./ref";
import { isAsyncFunction } from "./utils";

export type Computed<T> = VynnReadonlyRef<T>;

export type ComputedOptions = {
  lazy?: boolean;
};

export function $computed<T>(getter: () => Promise<T>, options?: ComputedOptions): Computed<T>;
export function $computed<T>(getter: () => T, options?: ComputedOptions): Computed<T>;
export function $computed<T>(
  getter: () => T | Promise<T>,
  options: ComputedOptions = {},
): Computed<T> {
  if (typeof getter !== "function") {
    throw new TypeError("[vynn]: $computed() requires a getter function.");
  }

  if (isAsyncFunction(getter) || isAsyncGetterFromLazy(getter)) {
    const resource = createAsyncResource(getter as () => Promise<T>, {
      lazy: options.lazy ?? false,
      retainPrevious: true,
    });

    const computed = markRef({
      get value(): T {
        return resource.value;
      },
    }) as Computed<T>;

    registerPending(computed, () => isPending(resource));
    return computed;
  }

  const target = {};
  let value: T;
  let hasValue = false;
  let dirty = true;
  let pendingError: NotReadyError | undefined;

  const computed = markRef({
    get value(): T {
      track(target, "value");

      if (dirty) computation.run();

      if (pendingError && !hasValue) {
        const boundary = getAsyncBoundary();
        boundary?.(pendingError.promise);

        throw new NotReadyError(
          pendingError.promise,
          boundary ?? pendingError.boundary,
        );
      }

      return value;
    },
  }) as Computed<T>;

  const computation = createReactiveEffect(
    () => {
      dirty = false;

      try {
        const nextValue = getter() as T;
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
        throw error;
      }
    },
    {
      phase: "render",
      lazy: options.lazy ?? false,
      scheduler: () => {
        if (dirty) return;
        dirty = true;
        trigger(target, "value");
      },
    },
  );

  registerPending(computed, () => {
    // A synchronous computed can still be waiting on an async dependency.
    // During SSR, force its first value read so the active Await boundary
    // captures that dependency and retries after it settles.
    if (isServer() && pendingError && !hasValue) {
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
