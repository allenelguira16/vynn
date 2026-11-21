import { getAsyncBoundary } from "../context/async-boundary";
import {
  hasAsyncHydrationSlot,
  registerAsyncOwnerIDReservation,
} from "../context/async-owner-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import {
  commitOwnerIdentityTransaction,
  createOwnerIdentityTransaction,
  disposeOwner,
  getOwner,
  getOwnerIdentityPath,
  peekOwnerIdentityPath,
  rollbackOwnerIdentityTransaction,
  runWithOwner,
  type Owner,
} from "../life-cycle/owner";
import { cleanupSubscriber, withSubscriber, type ReactiveSubscriber } from "./graph";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { createCell, markRef, type VynnRef } from "./ref";
import { isPromiseLike } from "./utils";
import type { MaybeAsyncResourceControl } from "./maybe-async-resource";

export type State<T> = VynnRef<T>;

type Initial<T> = {
  result?: T | PromiseLike<T>;
  error?: NotReadyError;
  subscriber: ReactiveSubscriber;
  hasChanged: () => boolean;
};

type BridgeControl<T> = MaybeAsyncResourceControl<T>;

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
  const path = getOwnerIdentityPath(resourceOwner) ?? peekOwnerIdentityPath(resourceOwner.parent);
  if (path && hasAsyncHydrationSlot(path)) {
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
  commitOwnerIdentityTransaction(resourceOwner);
  const ownerPath = getOwnerIdentityPath(resourceOwner);
  if (initial.error && ownerPath) registerAsyncOwnerIDReservation(ownerPath);
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
