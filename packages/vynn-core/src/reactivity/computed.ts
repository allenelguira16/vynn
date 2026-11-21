import { getAsyncBoundary } from "../context/async-boundary";
import { getErrorBoundary } from "../context/error-boundary-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner, type Owner } from "../life-cycle/owner";
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
import { isAsyncFunction } from "./utils";

export type Computed<T> = VynnReadonlyRef<T>;

type AsyncComputedInitial<T> = {
  result?: T | PromiseLike<T>;
  error?: unknown;
  hasError: boolean;
  subscriber: ReactiveSubscriber;
  hasChanged: () => boolean;
};

function isPromiseLikeValue(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function createAsyncComputed<T>(
  getter: () => Promise<T>,
  owner: Owner | null,
): Computed<T> {
  let computed: Computed<T> | undefined;
  let loading: Promise<Computed<T>> | undefined;
  let failed = false;
  let failure: unknown;
  let activationOwner = owner;
  const target = {};

  function start(): Promise<Computed<T>> {
    if (!loading) {
      activationOwner ??= getOwner();

      loading = import("./computed-async")
        .then(({ createAsyncComputed }) => {
          computed = createAsyncComputed(getter, owner, activationOwner);
          trigger(target, "value");
          return computed;
        })
        .catch((error: unknown) => {
          failed = true;
          failure = error;
          trigger(target, "value");
          throw error;
        });

      if (isAsyncGetterFromLazy(getter)) registerPromiseFromLazy(loading);
      void loading.catch(() => {});
    }

    return loading;
  }

  if (owner) start();

  const result = markRef({
    get value(): T {
      track(target, "value");

      if (failed) throw failure;
      if (computed) return computed.value;

      const boundary = getAsyncBoundary();
      const pending = start();
      boundary?.(pending);
      throw new NotReadyError(pending, boundary);
    },
  }) as Computed<T>;

  registerPending(result, () => {
    if (import.meta.env.SSR && !computed && !failed) void result.value;
    return computed ? isPending(computed) : loading !== undefined && !failed;
  });

  return result;
}

function isPromiseLikeValue(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function $computed<T>(getter: () => Promise<T>): Computed<T>;
export function $computed<T>(getter: () => T): Computed<T>;
export function $computed<T>(getter: () => T | Promise<T>): Computed<T> {
  if (typeof getter !== "function") {
    throw new TypeError("[vynn]: $computed() requires a getter function.");
  }

  if (isAsyncFunction(getter) || isAsyncGetterFromLazy(getter)) {
    return createAsyncComputed(getter as () => Promise<T>, getOwner());
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
