export const REF: unique symbol = Symbol("vynn.reactivity.ref");
export const WRITABLE_REF: unique symbol = Symbol("vynn.reactivity.writable-ref");

export type ReactiveRef<T> = {
  readonly [REF]: T;
  readonly value: T;
};

export type WritableReactiveRef<T> = Omit<ReactiveRef<T>, "value"> & {
  value: T;
};

export function markRef<T extends object, Value>(
  value: T,
  writable = false,
): T & { readonly [REF]: Value } {
  Object.defineProperty(value, REF, { value: true });

  if (writable) {
    Object.defineProperty(value, WRITABLE_REF, { value: true });
  }

  return value as T & { readonly [REF]: Value };
}

export function isRef(value: unknown): value is ReactiveRef<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    REF in value
  );
}

export function isWritableRef(
  value: unknown,
): value is WritableReactiveRef<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    WRITABLE_REF in value
  );
}
