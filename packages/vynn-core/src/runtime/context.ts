export interface RuntimeContext {
  parent: RuntimeContext | null;
  values?: Map<string | symbol, unknown>;
  /** The owner active in this frame. Kept outside the general context Map. */
  currentOwner?: unknown;
}

export interface RuntimeContextStorage {
  getStore(): RuntimeContext | undefined;
  run<T>(context: RuntimeContext, callback: () => T): T;
}

const RUNTIME_CONTEXT_KEY = Symbol.for("vynn.runtime-context.v1");
const RUNTIME_STORAGE_KEY = Symbol.for("vynn.runtime-context-storage.v1");
const globalContext = globalThis as unknown as Record<symbol, unknown>;

function getRuntimeStorage(): RuntimeContextStorage | undefined {
  return globalContext[RUNTIME_STORAGE_KEY] as RuntimeContextStorage | undefined;
}

function getGlobalRuntimeContext(): RuntimeContext {
  let context = globalContext[RUNTIME_CONTEXT_KEY] as RuntimeContext | undefined;

  if (!context) {
    context = { parent: null };
    globalContext[RUNTIME_CONTEXT_KEY] = context;
  }

  return context;
}

/** Creates a context frame that inherits values from its parent frame. */
export function createRuntimeContext(
  parent: RuntimeContext | null = getRuntimeContextStore() ?? null,
): RuntimeContext {
  return { parent };
}

/** Installs the shared server-side AsyncLocalStorage adapter. */
export function installRuntimeContextStorage(storage: RuntimeContextStorage): void {
  const existing = getRuntimeStorage();

  if (existing && existing !== storage) {
    throw new Error("[Vynn] Runtime context storage has already been installed.");
  }

  if (!existing) {
    Object.defineProperty(globalThis, RUNTIME_STORAGE_KEY, {
      configurable: false,
      enumerable: false,
      value: storage,
      writable: false,
    });
  }
}

/** Returns the active runtime context, using AsyncLocalStorage during SSR. */
export function getRuntimeContext(): RuntimeContext {
  const storage = getRuntimeStorage();
  return storage?.getStore() ?? (storage ? { parent: null } : getGlobalRuntimeContext());
}

/**
 * Returns the active storage value without creating a server default.
 * Render entrypoints use this to inherit a parent request when appropriate.
 */
export function getRuntimeContextStore(): RuntimeContext | undefined {
  const storage = getRuntimeStorage();
  return storage ? storage.getStore() : getGlobalRuntimeContext();
}

/** Runs a callback with a specific runtime context. */
export function runWithRuntimeContext<T>(context: RuntimeContext, callback: () => T): T {
  const storage = getRuntimeStorage();

  if (storage) return storage.run(context, callback);

  const previous = getGlobalRuntimeContext();
  globalContext[RUNTIME_CONTEXT_KEY] = context;

  try {
    return callback();
  } finally {
    globalContext[RUNTIME_CONTEXT_KEY] = previous;
  }
}

/** Runs a callback in a child frame of the current runtime context. */
export function runWithRuntimeContextScope<T>(callback: () => T): T {
  return runWithRuntimeContext(createRuntimeContext(), callback);
}

/** Runs a callback in a fresh root context with no inherited values. */
export function runWithRuntimeContextRoot<T>(callback: () => T): T {
  return runWithRuntimeContext(createRuntimeContext(null), callback);
}

/** Captures the current context for callbacks that execute after this stack. */
export function bindRuntimeContext<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const context = getRuntimeContext();
  return (...args: TArgs) => runWithRuntimeContext(context, () => callback(...args));
}

/** Reads the nearest value in the runtime-context parent chain. */
export function getContext<T>(key: string | symbol): T | undefined {
  let context: RuntimeContext | null = getRuntimeContext();

  while (context) {
    const values = context.values;
    if (values?.has(key)) return values.get(key) as T;
    context = context.parent;
  }

  return undefined;
}

/** Writes a value into the active runtime-context frame. */
export function setContext<T>(key: string | symbol, value: T): void {
  const context = getRuntimeContext();
  (context.values ??= new Map()).set(key, value);
}

/** Updates the nearest existing value without shadowing it in the active frame. */
export function updateContext<T>(key: string | symbol, value: T): boolean {
  let context: RuntimeContext | null = getRuntimeContext();

  while (context) {
    const values = context.values;
    if (values?.has(key)) {
      values.set(key, value);
      return true;
    }
    context = context.parent;
  }

  return false;
}

/** Updates the nearest existing value using an updater function. */
export function modifyContext<T>(key: string | symbol, updater: (current: T) => T): boolean {
  let context: RuntimeContext | null = getRuntimeContext();

  while (context) {
    const values = context.values;
    if (values?.has(key)) {
      values.set(key, updater(values.get(key) as T));
      return true;
    }
    context = context.parent;
  }

  return false;
}


/** Reads the nearest active owner without allocating a general context Map. */
export function getRuntimeOwner<T>(): T | undefined {
  let context: RuntimeContext | null = getRuntimeContext();

  while (context) {
    if (Object.prototype.hasOwnProperty.call(context, "currentOwner")) {
      return context.currentOwner as T;
    }
    context = context.parent;
  }

  return undefined;
}

/** Sets the active owner in the current runtime frame. */
export function setRuntimeOwner(owner: unknown): void {
  getRuntimeContext().currentOwner = owner;
}
