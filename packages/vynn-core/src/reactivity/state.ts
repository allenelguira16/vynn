import { getOwner, getOwnerCleanups, runWithOwner } from "../life-cycle/owner";
import { bindRuntimeContext } from "../runtime/context";
import {
  allocateAsyncResourceID,
  allocateAsyncResourceIDFor,
  hasAsyncResourceValue,
  readAsyncResourceValue,
  withAsyncResourceScope,
  writeAsyncResourceValue,
  getAsyncResourceReadOwner,
} from "../runtime/async/runtime";
import {
  batch,
  createComputation,
  execute,
  hasDependency,
  isPromiseLike,
  node,
  notify,
  runComputation,
  track,
  type Source,
  assertNotInComputedGetter,
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
  beforeRead: () => void = () => {},
  onRead: (value: T) => void = () => {},
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
    const changed = hasError || !hasValue || pendingPromise !== undefined || !Object.is(value, next);
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
        beforeRead();
        track(source);
        if (hasError) throw error;
        if (pendingPromise) throw new PendingReadError(pendingPromise, source);
        onRead(value);
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

/**
 * Creates a plain state cell for an already-evaluated value.
 *
 * Unlike $state(value), this does not interpret function values as
 * initializers or promise values as asynchronous resources. It is intended
 * for runtime internals that need to store arbitrary user values.
 */
export function createStateValue<T>(value: T): State<T> {
  // List item/index cells are always synchronous values. Avoid constructing
  // the async-capable cell state machine and its pending/error closures.
  const source = node();
  let current = value;

  return markRef<{ value: T }, T>(
    {
      get value() {
        track(source);
        return current;
      },
      set value(next: T) {
        if (Object.is(current, next)) return;
        current = next;
        notify(source);
      },
    },
    true,
  ) as State<T>;
}

export function $state<T>(initializer: StateInitializer<T>): State<T>;
export function $state<T>(initializer: () => PromiseLike<T>): State<T>;
export function $state<T>(initializer: () => T): State<T>;
export function $state<T>(initializer: () => T | PromiseLike<T>): State<T>;
export function $state<T>(initial?: T): State<T>;
export function $state<T>(
  input?: T | StateInitializer<T>,
): State<T> {
  assertNotInComputedGetter("$state");

  if (typeof input !== "function") return cell(input as T).state;

  const owner = getOwner();
  if (owner?.disposed) {
    throw new Error("[vynn]: Cannot create state inside a disposed owner.");
  }

  const resourceID = allocateAsyncResourceID();
  const controllerSlot = createAbortControllerSlot();
  let pending = false;
  let asyncResource = false;
  let hydrationRead = false;
  let resourceReadOwner: ReturnType<typeof getOwner> = null;
  let resourceReadID: string | undefined;
  let version = 0;
  let updatePending = (_notifyObservers?: boolean) => {};
  let ownerCleanup: (() => void) | undefined;
  let resolveState = (_value: T) => {};
  let state!: State<T>;
  let reactive = false;
  let computation: ReturnType<typeof createComputation> | undefined;

  const disposeComputation = () => {
    if (!computation) return;
    computation.dispose();
    computation = undefined;
  };

  const releaseOwnerCleanup = () => {
    if (!owner || !ownerCleanup) return;
    const cleanups = owner.cleanups;
    if (cleanups) {
      const index = cleanups.indexOf(ownerCleanup);
      if (index !== -1) cleanups.splice(index, 1);
    }
    ownerCleanup = undefined;
  };

  const registerOwnerCleanup = () => {
    if (!owner || ownerCleanup) return;

    ownerCleanup = () => {
      version++;
      controllerSlot.abort();
      pending = false;
      updatePending(false);
      disposeComputation();
      ownerCleanup = undefined;
    };
    getOwnerCleanups(owner).push(ownerCleanup);
  };

  const cellValue = cell<T>(
    undefined as T,
    false,
    () => {
      version++;
      controllerSlot.abort();
      if (pending) {
        pending = false;
        updatePending();
      }
      // Keep an async initializer alive when it has reactive dependencies.
      // A manual write replaces the current value and invalidates in-flight work,
      // but a later dependency change should still be able to refresh the resource.
      if (computation?.dependencies === undefined) {
        disposeComputation();
        releaseOwnerCleanup();
      }
    },
    () => {
      resourceReadOwner = getAsyncResourceReadOwner();
      resourceReadID = undefined;
      if (!asyncResource || !resourceReadOwner) return;

      resourceReadID = resourceID ?? allocateAsyncResourceIDFor(state, resourceReadOwner);

      if (
        !import.meta.env.SSR &&
        owner === null &&
        !hydrationRead &&
        resourceReadID !== undefined &&
        hasAsyncResourceValue(resourceReadID, resourceReadOwner)
      ) {
        const hydrated = readAsyncResourceValue<T>(resourceReadID, resourceReadOwner);
        if (hydrated.found) {
          hydrationRead = true;
          version++;
          controllerSlot.abort();
          pending = false;
          resolveState(hydrated.value as T);
          updatePending();
        }
      }
    },
    value => {
      if (
        import.meta.env.SSR &&
        asyncResource &&
        resourceReadID !== undefined &&
        resourceReadOwner
      ) {
        writeAsyncResourceValue(resourceReadID, value, resourceReadOwner);
      }
    },
  );
  state = cellValue.state;
  const { fail, setPending, getPendingPromise, resolve } = cellValue;
  resolveState = resolve;

  updatePending = registerPending(
    state,
    () => pending,
    getPendingPromise,
    true,
    () => {
      try {
        void state.value;
      } catch {
        // Pending and failed values remain observable through normal value reads.
      }
      updatePending();
    },
  );

  const stopIfUnobserved = (): void => {
    if (computation?.dependencies !== undefined) return;
    disposeComputation();
    releaseOwnerCleanup();
  };

  const executeInitializer = (signal: AbortSignal): T | PromiseLike<T> => {
    const activeComputation = computation;
    if (!activeComputation) {
      throw new Error("[vynn]: Cannot execute a disposed async state initializer.");
    }

    // State initializers may create nested resources. Keep the computation's
    // scheduling priority derived, but temporarily allow those creations
    // while the initializer itself is executing.
    const previousPriority = activeComputation.priority;
    activeComputation.priority = 1;

    try {
      return execute(activeComputation, () =>
        runWithOwner(owner, () =>
          withAsyncResourceScope(resourceID, () =>
            (input as StateInitializer<T>)(signal),
          ),
        ),
      );
    } finally {
      activeComputation.priority = previousPriority;
    }
  };

  const waitFor = (promise: Promise<unknown>): void => {
    asyncResource = true;
    reactive = true;
    if (computation) computation.priority = 0;
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
      isCurrent: () => current === version && !!computation && !computation.disposed,
      resolve: bindRuntimeContext(() => {
        if (computation) runComputation(computation);
      }),
      reject: bindRuntimeContext(cause => {
        if (cause instanceof PendingReadError && computation && hasDependency(computation, cause.source)) {
          batch(() => {
            setPending(cause.promise);
            pending = true;
            updatePending();
          });
          return;
        }

        runWithOwner(owner, () => batch(() => {
          fail(cause);
          pending = false;
          updatePending();
          stopIfUnobserved();
        }));
      }),
    });
  };

  const start = (): void => {
    const activeComputation = computation;
    if (!activeComputation || activeComputation.disposed) return;

    const current = ++version;
    const controller = controllerSlot.start(input.length > 0);

    let result: T | PromiseLike<T>;
    try {
      result = executeInitializer(controller?.signal as AbortSignal);
    } catch (cause) {
      controllerSlot.abortRun(controller);

      if (cause instanceof PendingReadError) {
        if (hasDependency(activeComputation, cause.source)) {
          asyncResource = true;
          reactive = true;
          activeComputation.priority = 0;
          registerOwnerCleanup();

          batch(() => {
            setPending(cause.promise);
            pending = true;
            updatePending();
          });
        } else {
          waitFor(cause.promise);
        }
        return;
      }

      batch(() => {
        fail(cause);
        pending = false;
        updatePending();
      });
      if (reactive) stopIfUnobserved();
      else {
        disposeComputation();
        releaseOwnerCleanup();
      }
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
      if (reactive) stopIfUnobserved();
      else {
        disposeComputation();
        releaseOwnerCleanup();
      }
      return;
    }

    if (!asyncResult) {
      controllerSlot.finish(controller);

      batch(() => {
        resolve(result as T);
        pending = false;
        updatePending();
      });

      if (reactive) {
        stopIfUnobserved();
      } else {
        // A synchronous initializer remains a one-shot initializer. Its
        // reads are deliberately not retained as reactive dependencies.
        disposeComputation();
        releaseOwnerCleanup();
      }
      return;
    }

    asyncResource = true;
    reactive = true;
    activeComputation.priority = 0;

    const promise = Promise.resolve(result as PromiseLike<T>);
    registerOwnerCleanup();
    batch(() => {
      setPending(promise);
      pending = true;
      updatePending();
    });

    void settleAsync({
      promise,
      isCurrent: () => current === version && !activeComputation.disposed,
      resolve: bindRuntimeContext(value => runWithOwner(owner, () => batch(() => {
        controllerSlot.finish(controller);
        resolve(value as T);
        pending = false;
        updatePending();
        stopIfUnobserved();
      }))),
      reject: bindRuntimeContext(cause => {
        if (cause instanceof PendingReadError && hasDependency(activeComputation, cause.source)) {
          controllerSlot.finish(controller);
          batch(() => {
            setPending(cause.promise);
            pending = true;
            updatePending();
          });
          return;
        }

        runWithOwner(owner, () => batch(() => {
          controllerSlot.finish(controller);
          fail(cause);
          pending = false;
          updatePending();
          stopIfUnobserved();
        }));
      }),
    });
  };

  const initialComputation = createComputation(start, 0);
  computation = initialComputation;

  // Recreate nested resource slots without repeating async side effects,
  // then use the server's resolved one-shot value. The probe also collects
  // synchronous dependencies so a hydrated async state can refresh later.
  if (
    !import.meta.env.SSR &&
    resourceID !== undefined &&
    hasAsyncResourceValue(resourceID, owner)
  ) {
    const hydrated = readAsyncResourceValue<T>(resourceID, owner);

    if (hydrated.found) {
      asyncResource = true;
      reactive = true;
      const probeController = new AbortController();

      try {
        const probeResult = executeInitializer(probeController.signal);
        if (isPromiseLike<T>(probeResult)) {
          void Promise.resolve(probeResult).catch(() => {});
        }
      } catch {
        // The serialized result remains authoritative if probing suspends.
      } finally {
        probeController.abort();
      }

      if (computation) computation.priority = 0;
      registerOwnerCleanup();
      resolve(hydrated.value as T);
      stopIfUnobserved();
      return state;
    }
  }

  runComputation(initialComputation);
  return state;
}
