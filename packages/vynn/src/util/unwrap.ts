/**
 * unwraps proxy objects
 *
 * @param value - The value to unwrap.
 * @returns The unwrapped value.
 */
export function unwrap<T>(value: any): Partial<T> {
  function deepUnwrap(obj: any): any {
    if (obj === null || typeof obj !== "object") return obj;

    if (typeof obj === "function") return obj;

    const result: any = {};
    for (const key of Reflect.ownKeys(obj)) {
      const value = obj[key];
      result[key] = deepUnwrap(value);
    }
    return result;
  }

  return deepUnwrap(value);
}
