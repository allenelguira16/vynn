import { getOwner } from "../../life-cycle/owner";
import { withFakeAsyncApis } from "../../utils/fake-async";
import { deserializeAsyncHydrationValue } from "./serialization";
import {
  initializeAsyncRuntime,
  setAsyncHydrationProbe,
  setAsyncValueDeserializer,
} from "./runtime";

/** Initialize request-scoped resource indexing, serialization, and hydration probing. */
export function initializeAsyncHydrationRuntime(): void {
  if (!getOwner()) return;

  initializeAsyncRuntime();
  setAsyncValueDeserializer(deserializeAsyncHydrationValue);
  setAsyncHydrationProbe(withFakeAsyncApis);
}
