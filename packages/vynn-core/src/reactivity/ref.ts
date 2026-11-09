declare const VYNN_REF: unique symbol;

export type VynnRef<T> = {
  value: T;
  readonly [VYNN_REF]: true;
};

export type VynnReadonlyRef<T> = {
  readonly value: T;
  readonly [VYNN_REF]: true;
};

const refs = new WeakSet<object>();

export function markRef<T extends object>(value: T): T {
  refs.add(value);
  return value;
}

export function isRef(value: unknown): value is VynnReadonlyRef<unknown> {
  return typeof value === "object" && value !== null && refs.has(value);
}
