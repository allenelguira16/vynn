import { getAsyncBoundary } from "../context/async-boundary";
import { hasAsyncHydrationValue } from "../context/async-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import {
  createOwner,
  getOwnerIdentityPath,
  peekOwnerIdentityPath,
  runWithOwner,
  type Owner,
} from "../life-cycle/owner";
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
import {
  createAsyncResource,
  createAsyncResourceFromInitial,
  createAsyncResourceFromOwner,
} from "./resource";

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

export function createAsyncComputed<T>(
  getter: () => Promise<T>,
  owner: Owner | null,
  activationOwner: Owner | null = owner,
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
      const candidatePath = peekOwnerIdentityPath(activationOwner);
      suppressFallbackDuringHydration =
        candidatePath !== undefined && hasAsyncHydrationValue(candidatePath);

      loadResource = Promise.resolve(
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
        if (owner.disposed || resourceOwner.disposed) {
          throw new Error("[vynn]: Cannot create an async computed after its owner was disposed.");
        }

        loadResource = Promise.resolve(
          runWithOwner(owner, () => createAsyncResourceFromOwner(getter, resourceOwner)),
        );
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

        if (owner.disposed || resourceOwner.disposed) {
          throw new Error("[vynn]: Cannot create an async computed after its owner was disposed.");
        }

        loadResource = Promise.resolve(
          runWithOwner(owner, () =>
            createAsyncResourceFromInitial(getter, resourceOwner, initial),
          ),
        );
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

