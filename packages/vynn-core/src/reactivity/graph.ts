import { getRuntimeContext, runWithRuntimeContext } from "../runtime/context";

export type Source = {
  observers: Set<Computation>;
  storeTarget?: object;
  storeKey?: unknown;
};

export type Computation = {
  dependencies: Set<Source>;
  run: () => void;
  invalidate: () => void;
  dispose: () => void;
  disposed: boolean;
  running: boolean;
  runID: number;
  priority: 0 | 1 | 2;
};

type ExecutionContext = {
  computation: Computation;
  runID: number;
};

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

  if (sourceUnobservedHandler) {
    for (const source of unobservedStoreSources) {
      if (source.observers.size === 0) sourceUnobservedHandler(source);
    }
  }

  unobservedStoreSources.clear();
}

export function node(storeTarget?: object, storeKey?: unknown): Source {
  return storeTarget === undefined
    ? { observers: new Set() }
    : { observers: new Set(), storeTarget, storeKey };
}

function getActiveExecution(): ExecutionContext | undefined {
  const context = asyncExecutionContext?.get();
  return context === null ? undefined : context ?? active;
}

export function supportsAsyncTracking(): boolean {
  return asyncExecutionContext !== undefined;
}

export function isTracking(): boolean {
  const execution = getActiveExecution();
  return !!execution &&
    !execution.computation.disposed &&
    execution.computation.runID === execution.runID;
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
  if (source.observers.has(computation)) return;
  source.observers.add(computation);
  computation.dependencies.add(source);
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

export function notify(source: Source): void {
  for (const observer of source.observers) {
    queueFor(observer).add(observer);
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

  try {
    return asyncExecutionContext
      ? asyncExecutionContext.run(null, callback)
      : callback();
  } finally {
    active = previous;
  }
}

export function cleanup(
  computation: Computation,
  deferStoreSources = false,
): void {
  for (const source of computation.dependencies) {
    if (
      source.observers.delete(computation) &&
      source.observers.size === 0 &&
      source.storeTarget !== undefined
    ) {
      if (deferStoreSources) unobservedStoreSources.add(source);
      else sourceUnobservedHandler?.(source);
    }
  }
  computation.dependencies.clear();
}

export function execute<T>(computation: Computation, fn: () => T): T {
  if (computation.disposed) {
    throw new Error("Cannot execute a disposed reactive computation.");
  }
  if (computation.running) {
    throw new Error("Reactive cycle detected while executing a computation.");
  }

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
    return asyncExecutionContext
      ? asyncExecutionContext.run(execution, fn)
      : fn();
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

export function createComputation(
  run: () => void,
  priority: 0 | 1 | 2 = 2,
): Computation {
  const runtimeContext = getRuntimeContext();
  const runInContext = () => runWithRuntimeContext(runtimeContext, run);

  return {
    dependencies: new Set(),
    run: runInContext,
    invalidate: runInContext,
    disposed: false,
    running: false,
    runID: 0,
    priority,
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.runID++;
      derivedQueue.delete(this);
      renderQueue.delete(this);
      effectQueue.delete(this);
      cleanup(this);
    },
  };
}

export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function";
}
