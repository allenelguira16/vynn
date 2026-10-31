import type { AsyncLocalStorage } from "node:async_hooks";
import type { HeadContext } from "../context/head-context";

interface SsrRequestContext {
  head: HeadContext | undefined;
  modules: Set<string>;
}

const SSR_REQUEST_STORAGE = Symbol.for("vynn.ssr-request-storage");

type SsrStorage = AsyncLocalStorage<SsrRequestContext>;

function getExistingStorage(): SsrStorage | undefined {
  return Reflect.get(globalThis, SSR_REQUEST_STORAGE) as SsrStorage | undefined;
}

/**
 * Load Node's async context implementation only when an SSR request actually
 * starts. The server entry can be imported by Vite's shared module graph
 * without eagerly touching a Node builtin in the browser.
 */
async function getOrCreateStorage(): Promise<SsrStorage> {
  const existing = getExistingStorage();
  if (existing) return existing;

  const { AsyncLocalStorage } = await import("node:async_hooks");

  // Another request or another bundled copy may have initialized it while the
  // dynamic import was pending.
  const initialized = getExistingStorage();
  if (initialized) return initialized;

  const storage = new AsyncLocalStorage<SsrRequestContext>();

  Object.defineProperty(globalThis, SSR_REQUEST_STORAGE, {
    configurable: false,
    enumerable: false,
    value: storage,
    writable: false,
  });

  return storage;
}

function getStorage(): SsrStorage {
  const storage = getExistingStorage();

  if (!storage) {
    throw new Error(
      "[vynn]: No SSR request context is active. Wrap rendering and document assembly in runWithSsrContext().",
    );
  }

  return storage;
}

/** Creates an isolated SSR metadata scope for one server request. */
export async function runWithSsrContext<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const storage = await getOrCreateStorage();

  return storage.run(
    {
      head: undefined,
      modules: new Set<string>(),
    },
    callback,
  );
}

export function setSsrRequestHead(context: HeadContext): void {
  getStorage().getStore()!.head = context;
}

export function setSsrRequestModuleIds(modules: Set<string>): void {
  getStorage().getStore()!.modules = modules;
}

export function getSsrRequestHead(): HeadContext | undefined {
  return getStorage().getStore()!.head;
}

export function getSsrRequestModuleIds(): ReadonlySet<string> {
  return getStorage().getStore()!.modules;
}
