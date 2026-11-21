import { ASYNC_DATA_SSR_KEY } from "../const";
import { deserializeServerFunctionValue } from "../server-functions/serialization";

export type AsyncHydrationValue<T = unknown> = {
  found: boolean;
  value: T | undefined;
};

/**
 * Read one serialized result without confusing a valid falsy value with a
 * missing entry. The key is the async resource owner's stable hydration ID.
 */
export function getAsyncValue<T = unknown>(ownerID: string): AsyncHydrationValue<T> {
  if (import.meta.env.SSR) {
    return { found: false, value: undefined };
  }

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY] as
    | Record<string, unknown>
    | undefined;

  if (!values || !Object.prototype.hasOwnProperty.call(values, ownerID)) {
    return { found: false, value: undefined };
  }

  const encodedValue = values[ownerID];
  delete values[ownerID];

  return {
    found: true,
    value: deserializeServerFunctionValue(encodedValue) as T,
  };
}
