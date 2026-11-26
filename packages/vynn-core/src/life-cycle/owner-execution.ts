import type { Owner } from "./owner";

/**
 * Async execution storage for the active Owner.
 *
 * This is deliberately independent from RuntimeContext: Owner tracks the
 * lifecycle tree, while RuntimeContext carries ambient runtime values.
 */
export interface OwnerExecutionStorage {
  getStore(): Owner | null | undefined;
  run<T>(owner: Owner | null, callback: () => T): T;
}

const OWNER_EXECUTION_STORAGE_KEY = Symbol.for("vynn.owner-execution-storage.v1");
const globalStorage = globalThis as unknown as Record<symbol, unknown>;

function getOwnerExecutionStorage(): OwnerExecutionStorage | undefined {
  return globalStorage[OWNER_EXECUTION_STORAGE_KEY] as OwnerExecutionStorage | undefined;
}

/** Installs the server-side asynchronous Owner storage adapter. */
export function installOwnerExecutionStorage(storage: OwnerExecutionStorage): void {
  const existing = getOwnerExecutionStorage();

  if (existing && existing !== storage) {
    throw new Error("[Vynn] Owner execution storage has already been installed.");
  }

  if (!existing) {
    Object.defineProperty(globalThis, OWNER_EXECUTION_STORAGE_KEY, {
      configurable: false,
      enumerable: false,
      value: storage,
      writable: false,
    });
  }
}

type AsyncContextVariable<T> = {
  get(): T | undefined;
  run<R>(value: T, callback: () => R): R;
};

type AsyncContextRuntime = {
  Variable: new <T>() => AsyncContextVariable<T>;
};

const AsyncContextAPI = (globalThis as typeof globalThis & {
  AsyncContext?: AsyncContextRuntime;
}).AsyncContext;

const asyncOwnerContext = AsyncContextAPI
  ? new AsyncContextAPI.Variable<Owner | null>()
  : undefined;

// Synchronous fallback for browsers without AsyncContext. Server rendering
// installs AsyncLocalStorage, and browsers with AsyncContext use its async
// propagation instead of this process-local stack.
let activeOwner: Owner | null = null;

/** Returns the Owner active in the current synchronous or asynchronous scope. */
export function getActiveOwner(): Owner | null {
  const storage = getOwnerExecutionStorage();
  if (storage) return storage.getStore() ?? null;

  const contextOwner = asyncOwnerContext?.get();
  return contextOwner === undefined ? activeOwner : contextOwner;
}

/**
 * Activates an Owner independently from RuntimeContext.
 *
 * AsyncLocalStorage isolates overlapping server-side async executions.
 * AsyncContext provides the corresponding browser capability when available.
 * The fallback handles ordinary synchronous nesting with stack restoration.
 */
export function runWithOwnerExecution<T>(owner: Owner | null, callback: () => T): T {
  const storage = getOwnerExecutionStorage();
  if (storage) return storage.run(owner, callback);

  if (asyncOwnerContext) return asyncOwnerContext.run(owner, callback);

  const previousOwner = activeOwner;
  activeOwner = owner;

  try {
    return callback();
  } finally {
    activeOwner = previousOwner;
  }
}
