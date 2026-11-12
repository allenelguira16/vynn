import { track, trigger } from "./effect";

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

export function createCell<T>(initialValue: T): VynnRef<T> {
  const target = { value: initialValue };

  return markRef({
    get value(): T {
      track(target, "value");
      return target.value;
    },

    set value(nextValue: T) {
      if (Object.is(target.value, nextValue)) return;

      target.value = nextValue;
      trigger(target, "value");
    },
  }) as VynnRef<T>;
}
