import { ASYNC_DATA_SSR_KEY } from "../const";
import { getAsyncBoundary } from "../context/async-boundary";
import { ASYNC_OWNER_ID_RESERVATIONS_KEY, registerAsyncOwnerIDReservation } from "../context/async-owner-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import {
  commitOwnerIdentityTransaction,
  createOwnerIdentityTransaction,
  disposeOwner,
  getOwner,
  getOwnerIdentityID,
  hasOwnerIdentityTransaction,
  peekOwnerID,
  rollbackOwnerIdentityTransaction,
  runWithOwner,
  type Owner,
} from "../life-cycle/owner";
import {
  cleanupSubscriber,
  withSubscriber,
  type ReactiveSubscriber,
} from "./graph";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { createCell, markRef, type VynnRef } from "./ref";
import { isPromiseLike } from "./utils";

type InitialOutcome<T> = {
  result?: T | PromiseLike<T>;
  error?: NotReadyError;
  subscriber: ReactiveSubscriber;
  hasChanged: () => boolean;
};

type FirstRead = {
  read: boolean;
  owner: Owner | null;
};

function hasHydrationSlot(ownerID: string | undefined): boolean {
  if (!ownerID || import.meta.env.SSR || typeof window === "undefined") return false;

  const payload = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  if (payload === null || typeof payload !== "object") return false;

  const values = payload as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(values, ownerID)) return true;

  const reservations = values[ASYNC_OWNER_ID_RESERVATIONS_KEY];
  return Array.isArray(reservations) && reservations.includes(ownerID);
}

function finalizeSynchronousInitializer(owner: Owner): void {
  const hasOwnedIdentityWork = owner.children.length > 0 || owner.nodeCount > 0;
  const hasLifetimeWork = owner.cleanups.length > 0 || owner.mount.length > 0;

  if (hasOwnerIdentityTransaction(owner)) {
    if (hasOwnedIdentityWork) {
      commitOwnerIdentityTransaction(owner);
    } else {
      rollbackOwnerIdentityTransaction(owner);
    }

    if (!hasOwnedIdentityWork && !hasLifetimeWork) {
      disposeOwner(owner);
    }
    return;
  }

  if (!owner.id && !hasOwnedIdentityWork && !hasLifetimeWork) {
    disposeOwner(owner);
  }
}

async function waitForInitialValue<T>(
  resource: VynnRef<T>,
  owner: Owner | null,
): Promise<void> {
  while (true) {
    try {
      runWithOwner(owner, () => {
        void resource.value;
      });
      return;
    } catch (error) {
      if (!(error instanceof NotReadyError)) return;

      try {
        await error.promise;
      } catch {
        // Resource rejections are stored internally and surfaced on retry.
      }
    }
  }
}

function createResourceBridge<T>(
  load: () => Promise<VynnRef<T>>,
  onLoadFailure?: () => void,
  eager = false,
): VynnRef<T> {
  let resource: VynnRef<T> | undefined;
  let loading: Promise<VynnRef<T>> | undefined;
  let failed = false;
  let failure: unknown;
  let hasOverride = false;
  let override!: T;
  const firstRead: FirstRead = { read: false, owner: null };

  function startLoading(): Promise<VynnRef<T>> {
    if (loading) return loading;

    loading = load().then(
      async (value) => {
        resource = value;
        if (hasOverride) resource.value = override;

        if (firstRead.read) {
          await waitForInitialValue(resource, firstRead.owner);
        }

        return value;
      },
      (error: unknown) => {
        failed = true;
        failure = error;
        onLoadFailure?.();
        throw error;
      },
    );

    void loading.catch(() => {});
    return loading;
  }

  if (eager) startLoading();

  const bridge = markRef({
    get value(): T {
      if (failed) throw failure;
      if (hasOverride && !resource) return override;

      if (!resource) {
        if (!firstRead.read) {
          firstRead.read = true;
          firstRead.owner = getOwner();
        }

        const boundary = getAsyncBoundary();
        const pending = startLoading();
        boundary?.(pending);
        throw new NotReadyError(pending, boundary);
      }

      return resource.value;
    },

    set value(nextValue: T) {
      if (resource) {
        resource.value = nextValue;
      } else {
        hasOverride = true;
        override = nextValue;
        if (!firstRead.read) {
          firstRead.read = true;
          firstRead.owner = getOwner();
        }
        startLoading();
      }
    },
  }) as VynnRef<T>;

  registerPending(bridge, () => {
    if (import.meta.env.SSR && !resource && !failed && !hasOverride) {
      void bridge.value;
    }

    if (hasOverride && !resource) return false;
    return resource ? isPending(resource) : loading !== undefined && !failed;
  });

  return bridge;
}

function createLegacyResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner | null,
): VynnRef<T> {
  return createResourceBridge(
    () =>
      import("./maybe-async-resource").then(({ createLegacyMaybeAsyncResource }) =>
        createLegacyMaybeAsyncResource(initializer, owner),
      ),
    undefined,
    owner !== null,
  );
}

/**
 * Execute a function initializer once. Plain values become ordinary cells;
 * Promise-like results and suspended callbacks are promoted into resources.
 */
export function createMaybeAsyncState<T>(
  initializer: () => T | PromiseLike<T>,
): VynnRef<T> {
  const owner = getOwner();

  if (!owner || isAsyncGetterFromLazy(initializer)) {
    return createLegacyResource(initializer, owner);
  }

  const resourceOwner = createOwnerIdentityTransaction(owner);
  const candidateOwnerID =
    getOwnerIdentityID(resourceOwner) ?? peekOwnerID(resourceOwner.parent);

  if (hasHydrationSlot(candidateOwnerID)) {
    rollbackOwnerIdentityTransaction(resourceOwner);
    disposeOwner(resourceOwner);
    return createLegacyResource(initializer, owner);
  }

  let changed = false;
  const subscriber: ReactiveSubscriber = {
    dependencies: [],
    disposed: false,
    notify() {
      changed = true;
    },
  };

  let result: T | PromiseLike<T> | undefined;
  let initialError: unknown;
  let didThrow = false;

  try {
    result = runWithOwner(resourceOwner, () =>
      withSubscriber(subscriber, () => initializer()),
    );
  } catch (error) {
    didThrow = true;
    initialError = error;
  }

  let promiseLike = false;
  if (!didThrow) {
    try {
      promiseLike = isPromiseLike<T>(result as T | PromiseLike<T>);
    } catch (error) {
      didThrow = true;
      initialError = error;
    }
  }

  if (!didThrow && !promiseLike) {
    subscriber.disposed = true;
    cleanupSubscriber(subscriber);
    finalizeSynchronousInitializer(resourceOwner);
    return createCell(result as T);
  }

  if (didThrow && !(initialError instanceof NotReadyError)) {
    subscriber.disposed = true;
    cleanupSubscriber(subscriber);
    finalizeSynchronousInitializer(resourceOwner);
    throw initialError;
  }

  const initial: InitialOutcome<T> = {
    result: promiseLike ? result : undefined,
    error: initialError instanceof NotReadyError ? initialError : undefined,
    subscriber,
    hasChanged: () => changed,
  };

  const ownerID = commitOwnerIdentityTransaction(resourceOwner);
  if (initial.error && ownerID) registerAsyncOwnerIDReservation(ownerID);

  if (promiseLike) {
    void Promise.resolve(result as PromiseLike<T>).catch(() => {});
  }

  return createResourceBridge(
    () =>
      import("./maybe-async-resource").then(({ createPromotedMaybeAsyncResource }) =>
        createPromotedMaybeAsyncResource(initializer, owner, resourceOwner, initial),
      ),
    () => {
      subscriber.disposed = true;
      cleanupSubscriber(subscriber);
      disposeOwner(resourceOwner);
    },
    true,
  );
}
