import { getRuntimeContext, runWithRuntimeContext } from "../runtime/context";

export type Source = {
  firstObserver: Computation | null;
  secondObserver: Computation | null;
  observers?: Set<Computation>;
  storeTarget?: object;
  storeKey?: unknown;
};

export type Computation = {
  dependencies: Source | Set<Source> | undefined;
  callback: () => void;
  runtimeContext: ReturnType<typeof getRuntimeContext>;
  run: () => void;
  invalidate: () => void;
  dispose: () => void;
  disposed: boolean;
  running: boolean;
  runID: number;
  priority: 0 | 1 | 2;
};

export type ComputationExecutionContext = {
  computation: Computation;
  runID: number;
};

export interface ComputationExecutionStorage {
  getStore(): ComputationExecutionContext | null | undefined;
  run<T>(context: ComputationExecutionContext | null, callback: () => T): T;
}

const COMPUTATION_EXECUTION_STORAGE_KEY = Symbol.for("vynn.computation-execution-storage.v1");
const globalStorage = globalThis as unknown as Record<symbol, unknown>;

function getComputationExecutionStorage(): ComputationExecutionStorage | undefined {
  return globalStorage[COMPUTATION_EXECUTION_STORAGE_KEY] as
    | ComputationExecutionStorage
    | undefined;
}

/** Install request-isolated async execution storage in server runtimes. */
export function installComputationExecutionStorage(
  storage: ComputationExecutionStorage,
): void {
  const existing = getComputationExecutionStorage();

  if (existing && existing !== storage) {
    throw new Error("[Vynn] Reactive computation execution storage has already been installed.");
  }

  if (!existing) {
    Object.defineProperty(globalThis, COMPUTATION_EXECUTION_STORAGE_KEY, {
      configurable: false,
      enumerable: false,
      value: storage,
      writable: false,
    });
  }
}

type ExecutionContext = ComputationExecutionContext;

type AsyncContextVariable<T> = {
  get(): T | undefined;
  run<R>(value: T | undefined, callback: () => R): R;
};

type AsyncContextRuntime = {
  Variable: new <T>() => AsyncContextVariable<T>;
};

const AsyncContextAPI = (globalThis as typeof globalThis & {
  AsyncContext?: AsyncContextRuntime;
}).AsyncContext;

const asyncExecutionContext = AsyncContextAPI
  ? new AsyncContextAPI.Variable<ExecutionContext | null>()
  : undefined;

let active: ExecutionContext | undefined;
let batchDepth = 0;
let executionDepth = 0;
let flushing = false;

const derivedQueue = new Set<Computation>();
const renderQueue = new Set<Computation>();
const effectQueue = new Set<Computation>();
const unobservedStoreSources = new Set<Source>();
let sourceUnobservedHandler: ((source: Source) => void) | undefined;

export function setSourceUnobservedHandler(
  handler: (source: Source) => void,
): void {
  sourceUnobservedHandler = handler;
}

function flushUnobservedStoreSources(): void {
  if (unobservedStoreSources.size === 0) return;

  for (const source of unobservedStoreSources) {
    if (
      source.firstObserver === null &&
      source.secondObserver === null &&
      source.observers === undefined
    ) {
      sourceUnobservedHandler?.(source);
    }
  }

  unobservedStoreSources.clear();
}

export function node(storeTarget?: object, storeKey?: unknown): Source {
  return storeTarget === undefined
    ? { firstObserver: null, secondObserver: null }
    : { firstObserver: null, secondObserver: null, storeTarget, storeKey };
}

function getActiveExecution(): ExecutionContext | undefined {
  const stored = getComputationExecutionStorage()?.getStore();
  if (stored !== undefined) return stored ?? undefined;

  const context = asyncExecutionContext?.get();
  return context === null ? undefined : context ?? active;
}

export function supportsAsyncTracking(): boolean {
  return asyncExecutionContext !== undefined || getComputationExecutionStorage() !== undefined;
}

export function isTracking(): boolean {
  const execution = getActiveExecution();
  return !!execution &&
    !execution.computation.disposed &&
    execution.computation.runID === execution.runID;
}

/**
 * Reactive getters are derivations. Creating another reactive primitive from
 * one would make resource lifetime and identity depend on evaluation order.
 */
export function assertNotInComputedGetter(primitive: string): void {
  const execution = getActiveExecution();
  if (
    execution &&
    !execution.computation.disposed &&
    execution.computation.runID === execution.runID &&
    execution.computation.priority === 0
  ) {
    throw new Error(
      `[vynn]: ${primitive}() cannot be created inside a $computed getter. Create it outside the getter and read its value instead.`,
    );
  }
}

export function track(source: Source): void {
  const execution = getActiveExecution();
  if (
    !execution ||
    execution.computation.disposed ||
    execution.computation.runID !== execution.runID
  ) {
    return;
  }

  const computation = execution.computation;
  const dependencies = computation.dependencies;

  if (
    dependencies === source ||
    (dependencies instanceof Set && dependencies.has(source))
  ) {
    return;
  }

  // Most render computations read one source. Keep that edge inline and
  // allocate a Set only when a computation actually depends on multiple sources.
  if (dependencies === undefined) {
    computation.dependencies = source;
  } else if (dependencies instanceof Set) {
    dependencies.add(source);
  } else {
    computation.dependencies = new Set([dependencies, source]);
  }

  addObserver(source, computation);
}

function queueFor(computation: Computation): Set<Computation> {
  if (computation.priority === 0) return derivedQueue;
  return computation.priority === 1 ? renderQueue : effectQueue;
}

let effectFlushQueued = false;

function scheduleEffectFlush(): void {
  if (effectFlushQueued || effectQueue.size === 0) return;
  effectFlushQueued = true;
  queueMicrotask(flushEffects);
}

function takeNextSynchronous(): Computation | undefined {
  const queue = derivedQueue.size ? derivedQueue : renderQueue;
  const next = queue.values().next().value as Computation | undefined;
  if (next) queue.delete(next);
  return next;
}

function flushSynchronous(): void {
  if (flushing || batchDepth > 0 || executionDepth > 0) return;

  flushing = true;
  let failure: unknown;
  let failed = false;

  try {
    let computation: Computation | undefined;
    while ((computation = takeNextSynchronous())) {
      if (computation.disposed) continue;

      try {
        computation.invalidate();
      } catch (cause) {
        if (!failed) {
          failure = cause;
          failed = true;
        }
      }
    }
  } finally {
    flushing = false;
  }

  scheduleEffectFlush();
  if (failed) throw failure;
}

function flushEffects(): void {
  effectFlushQueued = false;
  if (flushing || batchDepth > 0 || executionDepth > 0) {
    scheduleEffectFlush();
    return;
  }

  flushing = true;
  let failure: unknown;
  let failed = false;

  try {
    while (true) {
      let synchronous: Computation | undefined;
      while ((synchronous = takeNextSynchronous())) {
        if (synchronous.disposed) continue;
        try {
          synchronous.invalidate();
        } catch (cause) {
          if (!failed) {
            failure = cause;
            failed = true;
          }
        }
      }

      const effect = effectQueue.values().next().value as Computation | undefined;
      if (!effect) break;
      effectQueue.delete(effect);
      if (effect.disposed) continue;

      try {
        effect.invalidate();
      } catch (cause) {
        if (!failed) {
          failure = cause;
          failed = true;
        }
      }
    }
  } finally {
    flushing = false;
  }

  flushSynchronous();
  scheduleEffectFlush();
  if (failed) throw failure;
}

function flush(): void {
  flushSynchronous();
}

function addObserver(source: Source, computation: Computation): void {
  const observers = source.observers;
  if (observers) {
    observers.add(computation);
    return;
  }

  if (source.firstObserver === computation || source.secondObserver === computation) {
    return;
  }

  if (!source.firstObserver) {
    source.firstObserver = computation;
    return;
  }

  if (!source.secondObserver) {
    source.secondObserver = computation;
    return;
  }

  source.observers = new Set([
    source.firstObserver,
    source.secondObserver,
    computation,
  ]);
  source.firstObserver = null;
  source.secondObserver = null;
}

function removeObserver(source: Source, computation: Computation): void {
  const observers = source.observers;
  if (observers) {
    observers.delete(computation);

    // Collapse the uncommon multi-subscriber Set back to the inline form
    // as soon as at most two computations remain.
    if (observers.size <= 2) {
      const remaining = [...observers];
      source.observers = undefined;
      source.firstObserver = remaining[0] ?? null;
      source.secondObserver = remaining[1] ?? null;
    }
    return;
  }

  if (source.firstObserver === computation) {
    source.firstObserver = source.secondObserver;
    source.secondObserver = null;
  } else if (source.secondObserver === computation) {
    source.secondObserver = null;
  }
}

export function notify(source: Source): void {
  if (source.observers) {
    for (const observer of source.observers) {
      queueFor(observer).add(observer);
    }
  } else {
    const first = source.firstObserver;
    const second = source.secondObserver;
    if (first) queueFor(first).add(first);
    if (second) queueFor(second).add(second);
  }

  flush();
}

export function batch<T>(callback: () => T): T {
  batchDepth++;
  let failed = false;

  try {
    return callback();
  } catch (cause) {
    failed = true;
    throw cause;
  } finally {
    batchDepth--;
    if (!failed) flush();
    else {
      try {
        flush();
      } catch {
        // Preserve the callback error.
      }
    }
  }
}

export function transaction<T>(callback: () => T): T {
  return batch(callback);
}

export function untrack<T>(callback: () => T): T {
  const previous = active;
  active = undefined;

  const runWithoutTracking = () =>
    asyncExecutionContext ? asyncExecutionContext.run(null, callback) : callback();

  try {
    const storage = getComputationExecutionStorage();
    return storage ? storage.run(null, runWithoutTracking) : runWithoutTracking();
  } finally {
    active = previous;
  }
}

export function cleanup(computation: Computation, deferStoreSources = false): void {
  const dependencies = computation.dependencies;
  if (!dependencies) return;

  const releaseIfUnobserved = (source: Source): void => {
    if (
      source.storeTarget === undefined ||
      source.firstObserver !== null ||
      source.secondObserver !== null ||
      source.observers !== undefined
    ) {
      return;
    }

    if (deferStoreSources) unobservedStoreSources.add(source);
    else sourceUnobservedHandler?.(source);
  };

  if (dependencies instanceof Set) {
    for (const source of dependencies) {
      removeObserver(source, computation);
      releaseIfUnobserved(source);
    }
    dependencies.clear();
  } else {
    removeObserver(dependencies, computation);
    releaseIfUnobserved(dependencies);
  }

  computation.dependencies = undefined;
}

export function execute<T>(computation: Computation, fn: () => T): T {
  if (computation.disposed) {
    throw new Error("Cannot execute a disposed reactive computation.");
  }
  if (computation.running) {
    throw new Error("Reactive cycle detected while executing a computation.");
  }

  // Delay source eviction until this computation has finished collecting
  // its new dependencies. A source that is immediately re-read stays cached.
  cleanup(computation, true);

  const previous = active;
  const execution = {
    computation,
    runID: ++computation.runID,
  };
  active = execution;
  computation.running = true;
  executionDepth++;

  try {
    const storage = getComputationExecutionStorage();
    if (storage) return storage.run(execution, fn);
    return asyncExecutionContext ? asyncExecutionContext.run(execution, fn) : fn();
  } finally {
    active = previous;
    computation.running = false;
    executionDepth--;
    if (executionDepth === 0) flushUnobservedStoreSources();
  }
}

export function runComputation(computation: Computation): void {
  if (computation.disposed) return;

  let failed = false;
  try {
    computation.run();
  } catch (cause) {
    failed = true;
    throw cause;
  } finally {
    if (!failed) flush();
    else {
      try {
        flush();
      } catch {
        // Preserve the computation error.
      }
    }
  }
}

function runComputationInContext(this: Computation): void {
  runWithRuntimeContext(this.runtimeContext, this.callback);
}

function disposeComputation(this: Computation): void {
  if (this.disposed) return;
  this.disposed = true;
  this.runID++;
  derivedQueue.delete(this);
  renderQueue.delete(this);
  effectQueue.delete(this);
  cleanup(this);
}

export function createComputation(
  callback: () => void,
  priority: 0 | 1 | 2 = 2,
): Computation {
  return {
    dependencies: undefined,
    callback,
    runtimeContext: getRuntimeContext(),
    run: runComputationInContext,
    invalidate: runComputationInContext,
    disposed: false,
    running: false,
    runID: 0,
    priority,
    dispose: disposeComputation,
  };
}

export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function";
}


/** Returns whether a computation currently tracks a source. */
export function hasDependency(computation: Computation, source: Source): boolean {
  const dependencies = computation.dependencies;
  return dependencies === source ||
    (dependencies instanceof Set && dependencies.has(source));
}
