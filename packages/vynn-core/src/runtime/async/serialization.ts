import {
  deserializeServerFunctionValue,
  serializeServerFunctionValue,
} from "../../server-functions/serialization";

const ASYNC_VALUE_TAG = "$vynn:async";

function isJsonCompatible(value: unknown, ancestors: WeakSet<object>): boolean {
  if (value === null) return true;

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value) && !Object.is(value, -0);
    case "object":
      break;
    default:
      return false;
  }

  const object = value as object;
  if (ancestors.has(object)) return false;

  ancestors.add(object);

  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        Object.getOwnPropertyDescriptor(value, "toJSON")
      ) {
        return false;
      }

      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor ||
          !("value" in descriptor) ||
          !isJsonCompatible(descriptor.value, ancestors)
        ) {
          return false;
        }
      }

      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    if (
      prototype !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyDescriptor(value, "toJSON")
    ) {
      return false;
    }

    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !isJsonCompatible(descriptor.value, ancestors)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    // Proxies and exotic objects use the tagged serializer instead.
    return false;
  } finally {
    ancestors.delete(object);
  }
}

function isHydrationEnvelope(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value[0] === ASYNC_VALUE_TAG &&
    (value[1] === "json" || value[1] === "tagged")
  );
}

/**
 * Keeps ordinary JSON-compatible resource values in their native JSON shape.
 * Special JavaScript values retain the server-function codec as a fallback.
 */
export function serializeAsyncHydrationValue(value: unknown): unknown {
  if (isJsonCompatible(value, new WeakSet())) {
    // Escape a user value that happens to have the protocol envelope shape.
    return isHydrationEnvelope(value) ? [ASYNC_VALUE_TAG, "json", value] : value;
  }

  return [ASYNC_VALUE_TAG, "tagged", serializeServerFunctionValue(value)];
}

/** Decodes values produced by serializeAsyncHydrationValue(). */
export function deserializeAsyncHydrationValue(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 3 || value[0] !== ASYNC_VALUE_TAG) {
    return value;
  }

  if (value[1] === "json") return value[2];
  if (value[1] === "tagged") return deserializeServerFunctionValue(value[2]);

  return value;
}
