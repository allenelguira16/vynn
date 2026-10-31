import { AsyncLocalStorage } from "node:async_hooks";
import type { HeadContext } from "../context/head-context";

interface SsrRequestContext {
  head: HeadContext | undefined;
  modules: Set<string>;
}

// Vite can load the server entry and request handler as separate runtime copies.
// Share one AsyncLocalStorage instance across those copies.
const SSR_REQUEST_STORAGE = Symbol.for("vynn.ssr-request-storage");

function getStorage(): AsyncLocalStorage<SsrRequestContext> {
  const existing = Reflect.get(globalThis, SSR_REQUEST_STORAGE);
  if (existing) return existing as AsyncLocalStorage<SsrRequestContext>;

  const storage = new AsyncLocalStorage<SsrRequestContext>();
  Object.defineProperty(globalThis, SSR_REQUEST_STORAGE, {
    configurable: false,
    enumerable: false,
    value: storage,
    writable: false,
  });
  return storage;
}

const storage = getStorage();

/** Creates an isolated SSR metadata scope for one server request. */
export function runWithSsrContext<T>(callback: () => T): T {
  return storage.run(
    { head: undefined, modules: new Set<string>() },
    callback,
  );
}

export function setSsrRequestHead(context: HeadContext): void {
  const requestContext = storage.getStore();
  if (requestContext) requestContext.head = context;
}

export function setSsrRequestModuleIds(modules: Set<string>): void {
  const requestContext = storage.getStore();
  if (requestContext) requestContext.modules = modules;
}

export function getSsrRequestHead(): HeadContext | undefined {
  const requestContext = storage.getStore();
  if (!requestContext) {
    throw new Error(
      "[vynn]: No SSR request context is active. Wrap rendering and document assembly in runWithSsrContext().",
    );
  }
  return requestContext.head;
}

export function getSsrRequestModuleIds(): ReadonlySet<string> {
  const requestContext = storage.getStore();
  if (!requestContext) {
    throw new Error(
      "[vynn]: No SSR request context is active. Wrap rendering and document assembly in runWithSsrContext().",
    );
  }
  return requestContext.modules;
}
