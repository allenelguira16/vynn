import { getOwner } from "../../life-cycle/owner";
import { withFakeAsyncApis } from "../../utils/fake-async";
import { deserializeServerFunctionValue } from "../../server-functions/serialization";
import {
  initializeAsyncRuntime,
  setAsyncHydrationProbe,
  setAsyncValueDeserializer,
} from "./runtime";

/** Initialize request-scoped resource indexing, serialization, and hydration probing. */
export function initializeAsyncHydrationRuntime(): void {
  if (!getOwner()) return;

  initializeAsyncRuntime();
  setAsyncValueDeserializer(deserializeServerFunctionValue);
  setAsyncHydrationProbe(withFakeAsyncApis);
}
