import { ASYNC_DATA_SSR_KEY } from "../const";
import { getOwnerIdentityPathKey } from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";

export type AsyncHydrationValue<T = unknown> = {
  found: boolean;
  value: T | undefined;
};

/** Read a serialized result using its numeric owner-index path. */
export function getAsyncValue<T = unknown>(
  ownerPath: readonly number[],
): AsyncHydrationValue<T> {
  if (import.meta.env.SSR) {
    return { found: false, value: undefined };
  }

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY] as
    | Record<string, unknown>
    | undefined;
  const key = getOwnerIdentityPathKey(ownerPath);

  if (!values || !Object.prototype.hasOwnProperty.call(values, key)) {
    return { found: false, value: undefined };
  }

  const encodedValue = values[key];
  delete values[key];

  return {
    found: true,
    value: deserializeServerFunctionValue(encodedValue) as T,
  };
}
