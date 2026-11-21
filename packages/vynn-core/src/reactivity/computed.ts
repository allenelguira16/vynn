import { getAsyncBoundary } from "../context/async-boundary";
import { hasAsyncHydrationValue } from "../context/async-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import { createOwner, getOwner, getOwnerIdentityPath, peekOwnerIdentityPath, runWithOwner, type Owner } from "../life-cycle/owner";
import {
  cleanupSubscriber,
  track,
  trigger,
  withSubscriber,
  type ReactiveSubscriber,
} from "./graph";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { markRef, type VynnRef } from "./ref";
import { isAsyncFunction, isPromiseLike } from "./utils";
import { $computedSync, type Computed } from "./computed-sync";

export type { Computed } from "./computed-sync";

type AsyncComputedInitial<T> = {
  result?: T | PromiseLike<T>;
  error?: unknown;
  hasError: boolean;
  subscriber: ReactiveSubscriber;
  hasChanged: () => boolean;
};

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
      const candidatePath = peekOwnerIdentityPath(getOwner());
      suppressFallbackDuringHydration =
        candidatePath !== undefined && hasAsyncHydrationValue(candidatePath);

      loadResource = import("./resource").then(({ createAsyncResource }) =>
        runWithOwner(null, () => createAsyncResource(getter)),
      );
    } else {
      // Allocate the same owner slot synchronously as createAsyncResource()
      // did before code splitting. This keeps sibling hydration IDs stable.
      const resourceOwner = createOwner(owner);
      const candidatePath = getOwnerIdentityPath(resourceOwner);
      const canHydrate =
        !isAsyncGetterFromLazy(getter) &&
        candidatePath !== undefined &&
        hasAsyncHydrationValue(candidatePath);
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
          promiseLike = isPromiseLike(result);
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

  return $computedSync(getter);
}