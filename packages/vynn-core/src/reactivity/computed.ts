import { getAsyncBoundary } from "../context/async-boundary";
import { hasAsyncHydrationValue } from "../context/async-context";
import { getErrorBoundary } from "../context/error-boundary-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import { createOwner, getOwner, peekOwnerID, runWithOwner, type Owner } from "../life-cycle/owner";
import {
  cleanupSubscriber,
  track,
  trigger,
  withSubscriber,
  type ReactiveSubscriber,
} from "./graph";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { markRef, type VynnReadonlyRef, type VynnRef } from "./ref";
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
  let resource: VynnRef<T> | undefined;
  let loading: Promise<VynnRef<T>> | undefined;
  let failed = false;
  let failure: unknown;
  let suppressFallbackDuringHydration = false;
  const target = {};

  function start(): Promise<VynnRef<T>> {
    if (loading) return loading;

    let loadResource: Promise<VynnRef<T>>;

    if (!owner) {
      // Keep module-level resources dormant until their first read so they can
      // acquire the consuming render's hydration identity.
      const candidateID = peekOwnerID(getOwner());
      suppressFallbackDuringHydration =
        candidateID !== undefined && hasAsyncHydrationValue(candidateID);

      loadResource = import("./resource").then(({ createAsyncResource }) =>
        runWithOwner(null, () => createAsyncResource(getter)),
      );
    } else {
      // Allocate the same owner slot synchronously as createAsyncResource()
      // did before code splitting. This keeps sibling hydration IDs stable.
      const resourceOwner = createOwner(owner);
      const candidateID = resourceOwner.id;
      const canHydrate =
        !isAsyncGetterFromLazy(getter) &&
        candidateID !== undefined &&
        hasAsyncHydrationValue(candidateID);
      suppressFallbackDuringHydration = canHydrate;

      if (canHydrate) {
        loadResource = import("./resource").then(({ createAsyncResourceFromOwner }) => {
          if (owner.disposed || resourceOwner.disposed) {
            throw new Error("[vynn]: Cannot create an async computed after its owner was disposed.");
          }

          return runWithOwner(owner, () => createAsyncResourceFromOwner(getter, resourceOwner));
        });
      } else {
        let changed = false;
        let didThrow = false;
        let initialError: unknown;
        const subscriber: ReactiveSubscriber = {
          dependencies: [],
          disposed: false,
          notify() {
            changed = true;
          },
        };

        let result: T | PromiseLike<T> | undefined;

        let promiseLike = false;

        try {
          result = runWithOwner(resourceOwner, () =>
            withSubscriber(subscriber, () => getter()),
          );
          promiseLike = isPromiseLikeValue(result);
        } catch (error) {
          didThrow = true;
          initialError = error;
        }

        const initial: AsyncComputedInitial<T> = {
          result: didThrow ? undefined : result,
          error: initialError,
          hasError: didThrow,
          subscriber,
          hasChanged: () => changed,
        };

        resourceOwner.cleanups.push(() => {
          subscriber.disposed = true;
          cleanupSubscriber(subscriber);
        });

        if (!didThrow && promiseLike) {
          void Promise.resolve(result).catch(() => {});
        }

        loadResource = import("./resource").then(({ createAsyncResourceFromInitial }) => {
          if (owner.disposed || resourceOwner.disposed) {
            throw new Error("[vynn]: Cannot create an async computed after its owner was disposed.");
          }

          return runWithOwner(owner, () =>
            createAsyncResourceFromInitial(getter, resourceOwner, initial),
          );
        });
      }
    }

    loading = loadResource.then(
      (value) => {
        resource = value;
        trigger(target, "value");
        return value;
      },
      (error: unknown) => {
        failed = true;
        failure = error;
        trigger(target, "value");
        throw error;
      },
    );

    if (isAsyncGetterFromLazy(getter) || suppressFallbackDuringHydration) {
      registerPromiseFromLazy(loading);
    }

    void loading.catch(() => {});
    return loading;
  }

  if (owner) start();

  const computed = markRef({
    get value(): T {
      track(target, "value");

      if (failed) throw failure;
      if (resource) return resource.value;

      const boundary = getAsyncBoundary();
      const pending = start();
      boundary?.(pending);
      throw new NotReadyError(pending, boundary);
    },
  }) as Computed<T>;

  registerPending(computed, () => {
    if (import.meta.env.SSR && !resource && !failed) {
      void computed.value;
    }

    if (resource) return isPending(resource);
    return loading !== undefined && !failed;
  });

  return computed;
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
