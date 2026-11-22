import { getOwner, runWithOwner } from "../life-cycle/owner";
import { bindRuntimeContext } from "../runtime/context";
import {
  allocateAsyncResourceID,
  hasAsyncResourceValue,
  readAsyncResourceValue,
  withAsyncHydrationProbe,
  withAsyncResourceScope,
  writeAsyncResourceValue,
} from "../runtime/async/runtime";
import {
  batch,
  isPromiseLike,
  node,
  notify,
  track,
  type Source,
} from "./graph";
import { createAbortControllerSlot, settleAsync } from "./async/resource";
import { PendingReadError } from "./async/pending-error";
import { registerPending } from "./async/pending";
import { markRef, type WritableReactiveRef } from "./ref";

export type State<T> = WritableReactiveRef<T>;
type StateInitializer<T> = (signal: AbortSignal) => T | PromiseLike<T>;

function cell<T>(
  initial: T,
  initialized = true,
  onWrite: () => void = () => {},
): {
  state: State<T>;
  fail: (error: unknown) => void;
  setPending: (promise: Promise<unknown>) => void;
  getPendingPromise: () => Promise<unknown> | undefined;
  resolve: (value: T) => void;
} {
  const source: Source = node();
  let value = initial;
  let hasValue = initialized;
  let error: unknown;
  let hasError = false;
  let pendingPromise: Promise<unknown> | undefined;

  const setValue = (next: T, manual: boolean) => {
    const changed = hasError || !hasValue || !Object.is(value, next);
    if (!changed) return;

    value = next;
    hasValue = true;
    error = undefined;
    hasError = false;
    pendingPromise = undefined;

    batch(() => {
      if (manual) onWrite();
      notify(source);
    });
  };

  const state = markRef<{ value: T }, T>(
    {
      get value() {
        track(source);
        if (hasError) throw error;
        if (pendingPromise) throw new PendingReadError(pendingPromise, source);
        return value;
      },
      set value(next: T) {
        setValue(next, true);
      },
    },
    true,
  ) as State<T>;

  return {
    state,
    setPending(promise) {
      if (pendingPromise === promise) return;
      pendingPromise = promise;
      notify(source);
    },
    getPendingPromise() {
      return pendingPromise;
    },
    resolve(value) {
      setValue(value, false);
    },
    fail(cause) {
      error = cause;
      hasError = true;
      pendingPromise = undefined;
      notify(source);
    },
  };
}

export function $state<T>(initializer: StateInitializer<T>): State<T>;
export function $state<T>(initializer: () => PromiseLike<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(initializer: () => T | PromiseLike<T>): State<T>;
export function $state<T>(initial?: T): State<T>;
export function $state<T>(
  input?: T | StateInitializer<T>,
): State<T> {
  if (typeof input !== "function") return cell(input as T).state;

  const owner = getOwner();
  if (owner?.disposed) {
    throw new Error("[vynn]: Cannot create state inside a disposed owner.");
  }

  const resourceID = allocateAsyncResourceID();
  const controllerSlot = createAbortControllerSlot();
  let pending = false;
  let version = 0;
  let updatePending = (_notifyObservers?: boolean) => {};
  let ownerCleanup: (() => void) | undefined;

  const releaseOwnerCleanup = () => {
    if (!owner || !ownerCleanup) return;
    const index = owner.cleanups.indexOf(ownerCleanup);
    if (index !== -1) owner.cleanups.splice(index, 1);
    ownerCleanup = undefined;
  };

  const registerOwnerCleanup = () => {
    if (!owner || ownerCleanup) return;

    ownerCleanup = () => {
      version++;
      controllerSlot.abort();
      pending = false;
      updatePending(false);
      ownerCleanup = undefined;
    };
    owner.cleanups.push(ownerCleanup);
  };

  const { state, fail, setPending, getPendingPromise, resolve } = cell<T>(
    undefined as T,
    false,
    () => {
      controllerSlot.abort();
      if (pending) {
        version++;
        pending = false;
        updatePending();
      }
      releaseOwnerCleanup();
    },
  );

  updatePending = registerPending(state, () => pending, getPendingPromise);

  // Recreate nested resource slots without repeating async side effects,
  // then use the server's resolved one-shot value.
  if (
    !import.meta.env.SSR &&
    resourceID !== undefined &&
    hasAsyncResourceValue(resourceID, owner)
  ) {
    const hydrated = readAsyncResourceValue<T>(resourceID, owner);

    if (hydrated.found) {
      const probeController = new AbortController();

      try {
        const probeResult = runWithOwner(owner, () =>
          withAsyncResourceScope(resourceID, () =>
            withAsyncHydrationProbe(() =>
              (input as StateInitializer<T>)(probeController.signal),
            ),
          ),
        );

        if (isPromiseLike<T>(probeResult)) {
          void Promise.resolve(probeResult).catch(() => {});
        }
      } catch {
        // The serialized result remains authoritative if probing suspends.
      } finally {
        probeController.abort();
      }

      resolve(hydrated.value as T);
      return state;
    }
  }

  const start = (): void => {
    const current = ++version;
    const controller = controllerSlot.start(input.length > 0);

    let result: T | PromiseLike<T>;
    try {
      result = runWithOwner(owner, () =>
        withAsyncResourceScope(resourceID, () =>
          (input as StateInitializer<T>)(controller?.signal as AbortSignal),
        ),
      );
    } catch (cause) {
      controllerSlot.abortRun(controller);

      if (cause instanceof PendingReadError) {
        waitFor(cause.promise);
        return;
      }

      batch(() => {
        fail(cause);
        pending = false;
        updatePending();
      });
      releaseOwnerCleanup();
      return;
    }

    let asyncResult: boolean;
    try {
      asyncResult = isPromiseLike<T>(result);
    } catch (cause) {
      controllerSlot.abortRun(controller);
      batch(() => {
        fail(cause);
        pending = false;
        updatePending();
      });
      releaseOwnerCleanup();
      return;
    }

    if (!asyncResult) {
      controllerSlot.finish(controller);
      const wasPending = pending;

      if (import.meta.env.SSR && wasPending) {
        writeAsyncResourceValue(resourceID, result, owner);
      }

      batch(() => {
        resolve(result as T);
        pending = false;
        updatePending();
      });
      releaseOwnerCleanup();
      return;
    }

    const promise = Promise.resolve(result as PromiseLike<T>);
    registerOwnerCleanup();
    batch(() => {
      setPending(promise);
      pending = true;
      updatePending();
    });

    void settleAsync({
      promise,
      isCurrent: () => current === version,
      resolve: bindRuntimeContext(value => runWithOwner(owner, () => batch(() => {
        controllerSlot.finish(controller);
        writeAsyncResourceValue(resourceID, value, owner);
        resolve(value as T);
        pending = false;
        updatePending();
        releaseOwnerCleanup();
      }))),
      reject: bindRuntimeContext(cause => {
        if (cause instanceof PendingReadError) {
          waitFor(cause.promise);
          return;
        }

        runWithOwner(owner, () => batch(() => {
          controllerSlot.finish(controller);
          fail(cause);
          pending = false;
          updatePending();
          releaseOwnerCleanup();
        }));
      }),
    });
  };

  const waitFor = (promise: Promise<unknown>): void => {
    controllerSlot.abort();
    registerOwnerCleanup();
    const current = ++version;

    batch(() => {
      setPending(promise);
      pending = true;
      updatePending();
    });

    void settleAsync({
      promise,
      isCurrent: () => current === version,
      resolve: bindRuntimeContext(() => start()),
      reject: bindRuntimeContext(cause => {
        if (cause instanceof PendingReadError) {
          waitFor(cause.promise);
          return;
        }

        runWithOwner(owner, () => batch(() => {
          fail(cause);
          pending = false;
          updatePending();
          releaseOwnerCleanup();
        }));
      }),
    });
  };

  start();
  return state;
}
