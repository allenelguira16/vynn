import { AsyncLocalStorage } from "node:async_hooks";

import {
  installComputationExecutionStorage,
  type ComputationExecutionContext,
} from "./graph";

const COMPUTATION_EXECUTION_STORAGE_KEY = Symbol.for(
  "vynn.computation-execution-storage.v1",
);
const globalStorage = globalThis as unknown as Record<symbol, unknown>;
const existingStorage = globalStorage[COMPUTATION_EXECUTION_STORAGE_KEY];

if (
  existingStorage !== undefined &&
  !(existingStorage instanceof AsyncLocalStorage)
) {
  throw new Error("[Vynn] The global reactive computation storage key is already occupied.");
}

const computationExecutionStorage =
  (existingStorage as AsyncLocalStorage<ComputationExecutionContext | null> | undefined) ??
  new AsyncLocalStorage<ComputationExecutionContext | null>();

installComputationExecutionStorage(computationExecutionStorage);
