import { AsyncLocalStorage } from "node:async_hooks";

import {
  installRuntimeContextStorage,
  type RuntimeContext,
} from "../context";

const RUNTIME_STORAGE_KEY = Symbol.for("vynn.runtime-context-storage.v1");
const globalStorage = globalThis as unknown as Record<symbol, unknown>;
const existingStorage = globalStorage[RUNTIME_STORAGE_KEY];

if (existingStorage !== undefined && !(existingStorage instanceof AsyncLocalStorage)) {
  throw new Error("[Vynn] The global runtime-context storage key is already occupied.");
}

const runtimeStorage =
  (existingStorage as AsyncLocalStorage<RuntimeContext> | undefined) ??
  new AsyncLocalStorage<RuntimeContext>();

installRuntimeContextStorage(runtimeStorage);
