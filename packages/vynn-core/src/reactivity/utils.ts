export function isAsyncFunction(value: unknown): value is () => Promise<unknown> {
  return (
    typeof value === "function" &&
    Object.prototype.toString.call(value) === "[object AsyncFunction]"
  );
}

export function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isArrayIndex(key: PropertyKey): key is string {
  if (typeof key !== "string" || key === "") return false;

  const index = Number(key);

  return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key;
}
