import { AsyncLocalStorage } from "node:async_hooks";

import { installOwnerExecutionStorage } from "./owner-execution";
import type { Owner } from "./owner";

const OWNER_EXECUTION_STORAGE_KEY = Symbol.for("vynn.owner-execution-storage.v1");
const globalStorage = globalThis as unknown as Record<symbol, unknown>;
const existingStorage = globalStorage[OWNER_EXECUTION_STORAGE_KEY];

if (existingStorage !== undefined && !(existingStorage instanceof AsyncLocalStorage)) {
  throw new Error("[Vynn] The global Owner execution storage key is already occupied.");
}

const ownerExecutionStorage =
  (existingStorage as AsyncLocalStorage<Owner | null> | undefined) ??
  new AsyncLocalStorage<Owner | null>();

installOwnerExecutionStorage(ownerExecutionStorage);
