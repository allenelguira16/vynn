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
  assertNotInComputedGetter,
  type Source,
} from "./graph";
import {
  getOwner,
  getOwnerCleanups,
  runWithOwner,
} from "../life-cycle/owner";
import {
  allocateAsyncResourceID,
  allocateAsyncResourceIDFor,
  peekAsyncResourceID,
  hasAsyncResourceValue,
  readAsyncResourceValue,
  withAsyncHydrationProbe,
  writeAsyncResourceValue,
  getAsyncResourceReadOwner,
  withAsyncResourceReadOwner,
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
  assertNotInComputedGetter("$computed");

  if (typeof getter !== "function") {
    throw new TypeError("[vynn]: $computed() requires a getter function.");
  }

  const owner = getOwner();
  if (owner?.disposed) {
    throw new Error("[vynn]: Cannot create a computed value inside a disposed owner.");
  }

  const lazyGetter = isAsyncGetterFromLazy(getter);
  const hydrationResourceID = lazyGetter ? undefined : peekAsyncResourceID(owner);
  let resourceID: string | undefined;

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

  const computation = createComputation(() => withAsyncResourceReadOwner(owner, () => {
    dirty = false;
    const current = ++version;
    const controller = controllerSlot.start(getter.length > 0);

    let result!: T | PromiseLike<T>;
    try {
      let usedProbeResult = false;

      if (
        !hydrationProbeComplete &&
        !import.meta.env.SSR &&
        !lazyGetter &&
        owner &&
        hasAsyncResourceValue(hydrationResourceID, owner)
      ) {
        const probeController = new AbortController();
        let probeResult: T | PromiseLike<T>;

        try {
          probeResult = execute(computation, () =>
            runWithOwner(null, () =>
              withAsyncHydrationProbe(() => getter(probeController.signal)),
            ),
          );
        } catch (cause) {
          probeController.abort();

          // A dependency may itself need to hydrate before this getter can
          // reveal whether it returns a Promise. Keep the probe available for
          // the next run rather than assigning this derived value an ID.
          if (!(cause instanceof PendingReadError && hasDependency(computation, cause.source))) {
            hydrationProbeComplete = true;
          }

          throw cause;
        }

        if (isPromiseLike<T>(probeResult)) {
          hydrationProbeComplete = true;

          // Dependencies have already claimed their hydration slots during the
          // probe. Allocate this computed's slot only after those reads.
          resourceID ??= allocateAsyncResourceID(owner);
          const hydrated = readAsyncResourceValue<T>(resourceID, owner);

          // The probe uses fake async APIs. It must never settle into the live
          // computation, whether or not a matching SSR value was available.
          void Promise.resolve(probeResult).catch(() => {});
          probeController.abort();

          if (hydrated.found) {
            hydratedValue = hydrated;
            result = hydrated.value as T;
            usedProbeResult = true;
          }
        } else {
          // A synchronous derived getter is its own result. It may have read
          // and consumed an async dependency, but it must not claim that
          // dependency's serialized value as its own.
          hydrationProbeComplete = true;
          probeController.abort();
          result = probeResult as T;
          usedProbeResult = true;
        }
      }

      if (!hydrationProbeComplete && !import.meta.env.SSR && !lazyGetter && owner) {
        // No candidate SSR value exists at the next resource slot. Skip the
        // hydration probe rather than evaluating this getter twice.
        hydrationProbeComplete = true;
      }

      if (!usedProbeResult) {
        result = execute(computation, () =>
          runWithOwner(null, () => getter(controller?.signal as AbortSignal)),
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
      if (!lazyGetter && owner && resourceID === undefined) {
        resourceID = allocateAsyncResourceID(owner);
      }
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
        resolve: bindRuntimeContext(next => batch(() => {
          controllerSlot.finish(controller);
          const valueChanged = pending || hasError || !isEqual(next as T);
          value = next as T;
          hasValue = true;
          pendingPromise = undefined;
          error = undefined;
          hasError = false;
          pending = false;
          updatePending();
          if (valueChanged) notify(source);
        })),
        reject: bindRuntimeContext(cause => batch(() => {
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
        })),
      });

      batch(() => {
        updatePending();
        if (changed) notify(source);
      });
      return;
    }

    controllerSlot.finish(controller);
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
  }), 0);

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

      const readerOwner = getAsyncResourceReadOwner();
      const isAsyncResource = asyncComputeds.has(computed);
      const readResourceID = !lazyGetter && isAsyncResource
        ? (resourceID ?? (readerOwner
          ? allocateAsyncResourceIDFor(computed, readerOwner)
          : undefined))
        : undefined;

      // Ownerless resources may have started before hydration established the
      // render runtime. Consume the server snapshot when the first component
      // reads the resource, invalidating any speculative client settlement.
      if (
        owner === null &&
        !import.meta.env.SSR &&
        readResourceID !== undefined &&
        readerOwner &&
        hasAsyncResourceValue(readResourceID, readerOwner)
      ) {
        const hydrated = readAsyncResourceValue<T>(readResourceID, readerOwner);
        if (hydrated.found) {
          const next = hydrated.value as T;
          const changed = pending || hasError || !isEqual(next);
          version++;
          controllerSlot.abort();
          dirty = false;
          value = next;
          hasValue = true;
          pending = false;
          pendingPromise = undefined;
          error = undefined;
          hasError = false;
          updatePending();
          if (changed) notify(source);
        }
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
      if (
        import.meta.env.SSR &&
        readResourceID !== undefined &&
        readerOwner &&
        asyncComputeds.has(computed)
      ) {
        writeAsyncResourceValue(readResourceID, value, readerOwner);
      }
      return value as T;
    },
  }) as Computed<T>;

  updatePending = registerPending(
    computed,
    () => pending,
    () => pendingPromise,
    !(lazyGetter && import.meta.env.SSR),
    () => {
      try {
        void computed.value;
      } catch {
        // Pending and failed values remain observable through normal value reads.
      }
      updatePending();
    },
  );

  if (owner) getOwnerCleanups(owner).push(() => {
    version++;
    controllerSlot.abort();
    pending = false;
    pendingPromise = undefined;
    computation.dispose();
    updatePending(false);
  });

  runComputation(computation);

  return computed;
}

export { isPending } from "./async/pending";
