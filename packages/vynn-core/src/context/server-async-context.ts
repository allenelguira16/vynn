import { AsyncLocalStorage } from "node:async_hooks";

import type { AsyncRenderContext } from "./async-render-context";

const STORAGE_KEY = Symbol.for("vynn.async-render-context-storage.v1");
const PROVIDER_KEY = Symbol.for("vynn.async-render-context-provider.v1");

const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
const existingStorage = globals[STORAGE_KEY];

if (existingStorage !== undefined && !(existingStorage instanceof AsyncLocalStorage)) {
  throw new Error("[Vynn] The global async-render storage key is already occupied.");
}

const storage =
  (existingStorage as AsyncLocalStorage<AsyncRenderContext> | undefined) ??
  new AsyncLocalStorage<AsyncRenderContext>();

if (existingStorage === undefined) {
  Object.defineProperty(globals, STORAGE_KEY, {
    configurable: false,
    enumerable: false,
    value: storage,
    writable: false,
  });
}

const existingProvider = globals[PROVIDER_KEY];

if (existingProvider === undefined) {
  Object.defineProperty(globals, PROVIDER_KEY, {
    configurable: false,
    enumerable: false,
    value: { get: () => storage.getStore() },
    writable: false,
  });
} else if (
  typeof existingProvider !== "object" ||
  existingProvider === null ||
  typeof (existingProvider as { get?: unknown }).get !== "function"
) {
  throw new Error("[Vynn] The global async-render context provider key is already occupied.");
}

/** Run one SSR render with isolated async hydration values and reservations. */
export function runWithServerAsyncContext<T>(callback: () => T): T {
  return storage.run(
    {
      values: Object.create(null) as Record<string, unknown>,
      reservations: new Set<string>(),
    },
    callback,
  );
}
