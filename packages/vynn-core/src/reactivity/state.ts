import { ASYNC_DATA_SSR_KEY } from "../const";
import { getAsyncBoundary } from "../context/async-boundary";
import {
  ASYNC_OWNER_ID_RESERVATIONS_KEY,
  registerAsyncOwnerIDReservation,
} from "../context/async-owner-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import {
  commitOwnerIdentityTransaction,
  createOwnerIdentityTransaction,
  disposeOwner,
  getOwner,
  getOwnerIdentityID,
  peekOwnerID,
  rollbackOwnerIdentityTransaction,
  runWithOwner,
  type Owner,
} from "../life-cycle/owner";
import { cleanupSubscriber, withSubscriber, type ReactiveSubscriber } from "./graph";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { createCell, markRef, type VynnRef } from "./ref";

export type State<T> = VynnRef<T>;

type Initial<T> = {
  result?: T | PromiseLike<T>;
  error?: NotReadyError;
  subscriber: ReactiveSubscriber;
  hasChanged: () => boolean;
};

type BridgeControl<T> = {
  attach(resource: VynnRef<T>): void;
  hasRead(): boolean;
  getReadOwner(): Owner | null;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function hasHydrationSlot(id: string | undefined): boolean {
  if (!id || import.meta.env.SSR || typeof window === "undefined") return false;
  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  if (!values || typeof values !== "object") return false;
  const payload = values as Record<string, unknown>;
  const reservations = payload[ASYNC_OWNER_ID_RESERVATIONS_KEY];
  return (
    Object.prototype.hasOwnProperty.call(payload, id) ||
    (Array.isArray(reservations) && reservations.includes(id))
  );
}

function finishInitializer(owner: Owner): void {
  const hasChildren = owner.children.length > 0 || owner.nodeCount > 0;
  const hasCleanups = owner.cleanups.length > 0 || owner.mount.length > 0;
  if (hasChildren) commitOwnerIdentityTransaction(owner);
  else rollbackOwnerIdentityTransaction(owner);
  if (!hasChildren && !hasCleanups) disposeOwner(owner);
}

function createBridge<T>(
  load: (control: BridgeControl<T>) => Promise<VynnRef<T>>,
  owner: Owner | null,
  onFailure?: () => void,
): VynnRef<T> {
  let resource: VynnRef<T> | undefined;
  let loading: Promise<VynnRef<T>> | undefined;
  let failure: unknown;
  let failed = false;
  let hasOverride = false;
  let override!: T;
  let readOwner: Owner | null = null;
  let hasRead = false;

  const control: BridgeControl<T> = {
    attach(value) {
      resource = value;
      if (hasOverride) value.value = override;
    },
    hasRead: () => hasRead,
    getReadOwner: () => readOwner,
  };

  const start = () => {
    if (!loading) {
      loading = load(control).catch((error: unknown) => {
        failed = true;
        failure = error;
        onFailure?.();
        throw error;
      });
      void loading.catch(() => {});
    }
    return loading;
  };

  if (owner) start();

  const bridge = markRef({
    get value(): T {
      if (failed) throw failure;
      if (hasOverride && !resource) return override;
      if (resource) return resource.value;
      hasRead = true;
      readOwner ??= getOwner();
      const boundary = getAsyncBoundary();
      const promise = start();
      boundary?.(promise);
      throw new NotReadyError(promise, boundary);
    },
    set value(next: T) {
      if (resource) {
        resource.value = next;
        return;
      }
      hasOverride = true;
      override = next;
      hasRead = true;
      readOwner ??= getOwner();
      start();
    },
  }) as VynnRef<T>;

  registerPending(bridge, () => {
    if (import.meta.env.SSR && !resource && !failed && !hasOverride) void bridge.value;
    if (hasOverride && !resource) return false;
    return resource ? isPending(resource) : loading !== undefined && !failed;
  });

  return bridge;
}

function createLegacy<T>(initializer: () => T | PromiseLike<T>, owner: Owner | null): VynnRef<T> {
  return createBridge(
    (control) =>
      import("./maybe-async-resource").then(({ createLegacyMaybeAsyncResource }) =>
        createLegacyMaybeAsyncResource(initializer, owner, control),
      ),
    owner,
  );
}

function createPromoted<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner,
  resourceOwner: Owner,
  initial: Initial<T>,
): VynnRef<T> {
  return createBridge(
    (control) =>
      import("./maybe-async-resource").then(({ createPromotedMaybeAsyncResource }) =>
        createPromotedMaybeAsyncResource(initializer, owner, resourceOwner, initial, control),
      ),
    owner,
    () => {
      initial.subscriber.disposed = true;
      cleanupSubscriber(initial.subscriber);
      disposeOwner(resourceOwner);
    },
  );
}

function createMaybeAsyncState<T>(initializer: () => T | PromiseLike<T>): VynnRef<T> {
  const owner = getOwner();
  if (!owner || isAsyncGetterFromLazy(initializer)) return createLegacy(initializer, owner);

  const resourceOwner = createOwnerIdentityTransaction(owner);
  const id = getOwnerIdentityID(resourceOwner) ?? peekOwnerID(resourceOwner.parent);
  if (hasHydrationSlot(id)) {
    rollbackOwnerIdentityTransaction(resourceOwner);
    disposeOwner(resourceOwner);
    return createLegacy(initializer, owner);
  }

  let changed = false;
  const subscriber: ReactiveSubscriber = {
    dependencies: [],
    disposed: false,
    notify: () => {
      changed = true;
    },
  };

  let result: T | PromiseLike<T> | undefined;
  let error: unknown;
  let didThrow = false;
  let promiseLike = false;

  try {
    result = runWithOwner(resourceOwner, () =>
      withSubscriber(subscriber, () => initializer()),
    );
    promiseLike = isPromiseLike(result);
  } catch (caught) {
    didThrow = true;
    error = caught;
  }

  if (!didThrow && !promiseLike) {
    subscriber.disposed = true;
    cleanupSubscriber(subscriber);
    finishInitializer(resourceOwner);
    return createCell(result as T);
  }
  if (didThrow && !(error instanceof NotReadyError)) {
    subscriber.disposed = true;
    cleanupSubscriber(subscriber);
    finishInitializer(resourceOwner);
    throw error;
  }

  const initial: Initial<T> = {
    result: promiseLike ? result : undefined,
    error: error instanceof NotReadyError ? error : undefined,
    subscriber,
    hasChanged: () => changed,
  };
  const ownerID = commitOwnerIdentityTransaction(resourceOwner);
  if (initial.error && ownerID) registerAsyncOwnerIDReservation(ownerID);
  if (promiseLike) void Promise.resolve(result as PromiseLike<T>).catch(() => {});

  return createPromoted(initializer, owner, resourceOwner, initial);
}

export function $state<T>(initializer: () => Promise<T>): State<T>;
export function $state<T>(initializer: () => PromiseLike<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(value?: T): State<T>;
export function $state<T>(source?: T | (() => T | PromiseLike<T>)): State<T> {
  return typeof source === "function"
    ? createMaybeAsyncState(source as () => T | PromiseLike<T>)
    : createCell(source as T);
}
