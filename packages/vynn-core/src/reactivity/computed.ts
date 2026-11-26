import {
  batch,
  createComputation,
  execute,
  isPromiseLike,
  hasDependency,
  node,
  notify,
  runComputation,
  track,
  type Source,
} from "./graph";
import {
  createOwner,
  getOwner,
  getOwnerCleanups,
  runWithOwner,
  type Owner,
} from "../life-cycle/owner";
import {
  allocateAsyncResourceID,
  hasAsyncResourceValue,
  readAsyncResourceValue,
  withAsyncHydrationProbe,
  withAsyncResourceScope,
  writeAsyncResourceValue,
} from "../runtime/async/runtime";
import { bindRuntimeContext } from "../runtime/context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../runtime/lazy";
import { createAbortControllerSlot, settleAsync } from "./async/resource";
import { registerPending } from "./async/pending";
import { PendingReadError } from "./async/pending-error";
import { markRef, type ReactiveRef } from "./ref";

export type Computed<T> = ReactiveRef<T>;

const asyncComputeds = new WeakSet<object>();

export function isAsyncComputed(value: object): boolean {
  return asyncComputeds.has(value);
}

export type ComputedOptions<T> = {
  /** Defer the first getter execution until .value is read. */
  lazy?: boolean;
  /** Defaults to Object.is. Set false to notify on every recomputation. */
  equals?: false | ((previous: T, next: T) => boolean);
};

export function $computed<T>(
  getter: (signal: AbortSignal) => PromiseLike<T>,
  options?: ComputedOptions<T>,
): Computed<T>;
export function $computed<T>(
  getter: (signal: AbortSignal) => T,
  options?: ComputedOptions<T>,
): Computed<T>;
export function $computed<T>(
  getter: (signal: AbortSignal) => T | PromiseLike<T>,
  options?: ComputedOptions<T>,
): Computed<T>;
export function $computed<T>(
  getter: (signal: AbortSignal) => T | PromiseLike<T>,
  options: ComputedOptions<T> = {},
): Computed<T> {
  if (typeof getter !== "function") {
    throw new TypeError("[vynn]: $computed() requires a getter function.");
  }

  const owner = getOwner();
  if (owner?.disposed) {
    throw new Error("[vynn]: Cannot create a computed value inside a disposed owner.");
  }

  const lazyGetter = isAsyncGetterFromLazy(getter);
  const executionOwner: Owner | null = owner
    ? (lazyGetter || options.lazy ? createOwner(owner) : owner)
    : null;
  const resourceID = lazyGetter ? undefined : allocateAsyncResourceID(owner);

  const source: Source = node();
  let value: T | undefined;
  let hasValue = false;
  let pending = false;
  let pendingPromise: Promise<unknown> | undefined;
  let error: unknown;
  let hasError = false;
  let version = 0;
  let dirty = true;
  let hydrationProbeComplete = false;
  let hydratedValue: { found: boolean; value: T | undefined } | undefined;
  const controllerSlot = createAbortControllerSlot();
  let updatePending = (_notifyObservers?: boolean) => {};

  const isEqual = (next: T): boolean => {
    if (!hasValue || options.equals === false) return false;
    return (options.equals ?? Object.is)(value as T, next);
  };

  const computation = createComputation(() => {
    dirty = false;
    const current = ++version;
    const controller = controllerSlot.start(getter.length > 0);

    let result!: T | PromiseLike<T>;
    try {
      let usedHydrationProbe = false;

      if (
        current === 1 &&
        !hydrationProbeComplete &&
        !import.meta.env.SSR &&
        !lazyGetter
      ) {
        hydrationProbeComplete = true;

        const resourceOwner = executionOwner ?? owner;
        if (hasAsyncResourceValue(resourceID, resourceOwner)) {
          const hydrated = readAsyncResourceValue<T>(resourceID, resourceOwner);

          if (hydrated.found) {
            hydratedValue = hydrated;
            const probeController = new AbortController();

            try {
              const probeResult = execute(computation, () =>
                runWithOwner(executionOwner, () =>
                  withAsyncResourceScope(resourceID, () =>
                    withAsyncHydrationProbe(() => getter(probeController.signal)),
                  ),
                ),
              );

              if (isPromiseLike<T>(probeResult)) {
                void Promise.resolve(probeResult).catch(() => {});
              }
            } catch {
              // The serialized value remains authoritative for this hydration pass.
            } finally {
              probeController.abort();
            }

            result = hydrated.value as T;
            usedHydrationProbe = true;
          }
        }
      }

      if (!usedHydrationProbe) {
        result = execute(computation, () =>
          runWithOwner(executionOwner, () =>
            withAsyncResourceScope(resourceID, () =>
              getter(controller?.signal as AbortSignal),
            ),
          ),
        );
      }
    } catch (cause) {
      controllerSlot.abortRun(controller);
      batch(() => {
        let changed: boolean;

        if (
          cause instanceof PendingReadError &&
          hasDependency(computation, cause.source)
        ) {
          changed = !pending || pendingPromise !== cause.promise || hasError;
          error = undefined;
          hasError = false;
          pending = true;
          pendingPromise = cause.promise;
        } else {
          changed = !hasError || pending || !Object.is(error, cause);
          error = cause;
          hasError = true;
          pending = false;
          pendingPromise = undefined;
        }

        updatePending();
        if (changed) notify(source);
      });
      return;
    }

    let asyncResult: boolean;
    try {
      asyncResult = isPromiseLike<T>(result);
    } catch (cause) {
      controllerSlot.abortRun(controller);
      batch(() => {
        const changed = !hasError || pending || !Object.is(error, cause);
        error = cause;
        hasError = true;
        pending = false;
        pendingPromise = undefined;
        updatePending();
        if (changed) notify(source);
      });
      return;
    }

    if (hydratedValue?.found) {
      asyncComputeds.add(computed);
      const next = hydratedValue.value as T;
      hydratedValue = undefined;

      if (asyncResult) {
        void Promise.resolve(result as PromiseLike<T>).catch(() => {});
        controllerSlot.abortRun(controller);
      } else {
        controllerSlot.finish(controller);
      }

      batch(() => {
        const changed = pending || hasError || !isEqual(next);
        value = next;
        hasValue = true;
        pendingPromise = undefined;
        error = undefined;
        hasError = false;
        pending = false;
        updatePending();
        if (changed) notify(source);
      });
      return;
    }

    if (asyncResult) {
      asyncComputeds.add(computed);
      const promise = Promise.resolve(result as PromiseLike<T>);
      if (lazyGetter) registerPromiseFromLazy(promise);
      const changed = !pending || pendingPromise !== promise || hasError;

      pendingPromise = promise;
      error = undefined;
      hasError = false;
      pending = true;

      void settleAsync({
        promise,
        isCurrent: () => current === version && !computation.disposed,
        resolve: bindRuntimeContext(next => runWithOwner(executionOwner, () => batch(() => {
          controllerSlot.finish(controller);
          if (!lazyGetter) writeAsyncResourceValue(resourceID, next, executionOwner ?? owner);
          const valueChanged = pending || hasError || !isEqual(next as T);
          value = next as T;
          hasValue = true;
          pendingPromise = undefined;
          error = undefined;
          hasError = false;
          pending = false;
          updatePending();
          if (valueChanged) notify(source);
        }))),
        reject: bindRuntimeContext(cause => runWithOwner(executionOwner, () => batch(() => {
          controllerSlot.finish(controller);
          let errorChanged: boolean;

          if (
            cause instanceof PendingReadError &&
            hasDependency(computation, cause.source)
          ) {
            errorChanged = !pending || pendingPromise !== cause.promise || hasError;
            error = undefined;
            hasError = false;
            pending = true;
            pendingPromise = cause.promise;
          } else {
            errorChanged = !hasError || pending || !Object.is(error, cause);
            error = cause;
            hasError = true;
            pending = false;
            pendingPromise = undefined;
          }

          updatePending();
          if (errorChanged) notify(source);
        }))),
      });

      batch(() => {
        updatePending();
        if (changed) notify(source);
      });
      return;
    }

    controllerSlot.finish(controller);
    const wasPending = pending;

    if (import.meta.env.SSR && wasPending && !lazyGetter) {
      writeAsyncResourceValue(resourceID, result, executionOwner ?? owner);
    }

    batch(() => {
      const changed = pending || hasError || !isEqual(result as T);
      value = result as T;
      hasValue = true;
      pendingPromise = undefined;
      error = undefined;
      hasError = false;
      pending = false;
      updatePending();
      if (changed) notify(source);
    });
  }, 0);

  computation.invalidate = () => {
    if (dirty || computation.disposed) return;
    dirty = true;
    computation.run();
  };

  const computed = markRef<{ readonly value: T }, T>({
    get value() {
      if (computation.disposed) {
        if (!hasValue) {
          throw new Error("[vynn]: Cannot read a computed value after its owner was disposed before initialization.");
        }
        return value as T;
      }
      if (computation.running) {
        throw new Error("Circular computed dependency detected.");
      }
      track(source);
      if (dirty) runComputation(computation);
      if (hasError) throw error;
      if (pending && pendingPromise) {
        throw new PendingReadError(
          pendingPromise,
          source,
          !(lazyGetter && import.meta.env.SSR),
        );
      }
      if (!hasValue && pending) {
        throw new Error("Async computation is pending without an associated Promise.");
      }
      return value as T;
    },
  }) as Computed<T>;

  updatePending = registerPending(
    computed,
    () => pending,
    () => pendingPromise,
    !(lazyGetter && import.meta.env.SSR),
  );

  if (owner) getOwnerCleanups(owner).push(() => {
    version++;
    controllerSlot.abort();
    pending = false;
    pendingPromise = undefined;
    computation.dispose();
    updatePending(false);
  });

  if (!options.lazy) runComputation(computation);

  return computed;
}

export { isPending } from "./async/pending";
