import { getOwner } from "../life-cycle/owner";
import { createReactiveEffect, batch, track, trigger, triggerAll, triggerArrayLength, untrack } from "./effect";
import { createAsyncResource } from "./resource";
import { isRef, type VynnReadonlyRef, type VynnRef } from "./ref";
import { isPending, registerPending } from "./pending";
import { isArrayIndex, isPlainObject } from "./utils";

type StoreArrayValue<T> = T extends VynnReadonlyRef<unknown> ? T : StoreValue<T>;
type StoreCollectionValue<T> = T extends VynnReadonlyRef<unknown> ? T : StoreValue<T>;

type StoreValue<T> =
  T extends VynnReadonlyRef<infer Value>
    ? Value
    : T extends Function | Date | Error | RegExp | Promise<unknown>
      ? T
      : T extends Map<infer Key, infer Value>
        ? Map<Key, StoreCollectionValue<Value>>
        : T extends ReadonlyMap<infer Key, infer Value>
          ? ReadonlyMap<Key, StoreCollectionValue<Value>>
          : T extends Set<infer Value>
            ? Set<StoreCollectionValue<Value>>
            : T extends ReadonlySet<infer Value>
              ? ReadonlySet<StoreCollectionValue<Value>>
              : T extends readonly unknown[]
                ? { [Key in keyof T]: StoreArrayValue<T[Key]> }
                : T extends object
                  ? { [Key in keyof T]: StoreValue<T[Key]> }
                  : T;

export type Store<T extends object> = StoreValue<T> & object;

const rawToReactive = new WeakMap<object, object>();
const reactiveToRaw = new WeakMap<object, object>();

const ITERATE_KEY = Symbol("vynn.store.iterate");
const ARRAY_ITERATE_KEY = Symbol("vynn.store.array-iterate");
const MAP_KEY_ITERATE_KEY = Symbol("vynn.store.map-key-iterate");

const arrayMutatingMethods = new Set<PropertyKey>([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

function hasOwn(target: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isMap(value: object): value is Map<unknown, unknown> {
  return value instanceof Map;
}

function isSet(value: object): value is Set<unknown> {
  return value instanceof Set;
}

function isProxyable(value: object): boolean {
  return (
    Array.isArray(value) ||
    isPlainObject(value) ||
    isMap(value) ||
    isSet(value)
  );
}

function toRaw<T>(value: T): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }

  let current = value as object;
  let previous: object | undefined;

  while ((previous = reactiveToRaw.get(current))) current = previous;

  return current as T;
}

function toReactive<T>(value: T): T {
  if (value === null || typeof value !== "object" || isRef(value)) return value;
  return createReactiveObject(value) as T;
}

function triggerAdded(target: object, key: PropertyKey): void {
  trigger(target, key);

  if (Array.isArray(target)) {
    if (isArrayIndex(key)) {
      trigger(target, ARRAY_ITERATE_KEY);
      trigger(target, "length");
    }
    return;
  }

  trigger(target, ITERATE_KEY);
}

function triggerChanged(target: object, key: PropertyKey, next: unknown, previous: unknown): void {
  if (Object.is(next, previous)) return;

  if (Array.isArray(target)) {
    if (key === "length") {
      triggerArrayLength(target, Number(next), ARRAY_ITERATE_KEY);
    } else if (isArrayIndex(key)) {
      trigger(target, key);
      trigger(target, ARRAY_ITERATE_KEY);
    }
    return;
  }

  trigger(target, key);
}

function triggerDeleted(target: object, key: PropertyKey): void {
  trigger(target, key);

  if (Array.isArray(target)) {
    if (isArrayIndex(key)) trigger(target, ARRAY_ITERATE_KEY);
    return;
  }

  trigger(target, ITERATE_KEY);
}

function hasOwnProperty(this: object, key: unknown): boolean {
  const target = toRaw(this);
  const normalizedKey = typeof key === "symbol" ? key : String(key);

  track(target, normalizedKey);
  return hasOwn(target, normalizedKey);
}

function createArrayHandlers(beforeRead?: () => void): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      beforeRead?.();

      if (key === "hasOwnProperty") return hasOwnProperty;

      const value = Reflect.get(target, key, receiver);

      if (typeof key === "symbol" && key === Symbol.toStringTag) return value;
      track(target, key);

      if (typeof value === "function" && arrayMutatingMethods.has(key)) {
        return (...args: unknown[]) =>
          untrack(() =>
            batch(() => Reflect.apply(value, receiver, args.map((argument) => toRaw(argument)))),
          );
      }

      if (isRef(value) && isArrayIndex(key)) return value;
      if (isRef(value)) return toReactive(value.value);

      return toReactive(value);
    },

    set(target, key, value, receiver) {
      const previous = Reflect.get(target, key, target);
      const hadKey = isArrayIndex(key)
        ? Number(key) < (target as unknown[]).length
        : hasOwn(target, key);
      const rawValue = toRaw(value);

      return batch(() => {
        const result = Reflect.set(target, key, rawValue, toRaw(receiver));

        if (target === toRaw(receiver) && result) {
          if (!hadKey) triggerAdded(target, key);
          else triggerChanged(target, key, rawValue, previous);
        }

        return result;
      });
    },

    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);

      return batch(() => {
        const result = Reflect.deleteProperty(target, key);
        if (result && hadKey) triggerDeleted(target, key);
        return result;
      });
    },

    has(target, key) {
      beforeRead?.();
      const result = Reflect.has(target, key);
      track(target, key);
      return result;
    },

    ownKeys(target) {
      beforeRead?.();
      track(target, ARRAY_ITERATE_KEY);
      track(target, "length");
      return Reflect.ownKeys(target);
    },
  };
}

function createObjectHandlers(beforeRead?: () => void): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      beforeRead?.();

      if (key === "hasOwnProperty") return hasOwnProperty;

      const value = Reflect.get(target, key, receiver);
      if (typeof key === "symbol" && key === Symbol.toStringTag) return value;

      track(target, key);

      if (isRef(value)) return toReactive(value.value);
      return toReactive(value);
    },

    set(target, key, value, receiver) {
      const previous = Reflect.get(target, key, target);

      if (isRef(previous) && !isRef(value)) {
        (previous as VynnRef<unknown>).value = value;
        return true;
      }

      const hadKey = hasOwn(target, key);
      const rawValue = toRaw(value);

      return batch(() => {
        const result = Reflect.set(target, key, rawValue, toRaw(receiver));

        if (target === toRaw(receiver) && result) {
          if (!hadKey) triggerAdded(target, key);
          else triggerChanged(target, key, rawValue, previous);
        }

        return result;
      });
    },

    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);

      return batch(() => {
        const result = Reflect.deleteProperty(target, key);
        if (result && hadKey) triggerDeleted(target, key);
        return result;
      });
    },

    has(target, key) {
      beforeRead?.();
      const result = Reflect.has(target, key);
      track(target, key);
      return result;
    },

    ownKeys(target) {
      beforeRead?.();
      track(target, ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
  };
}

function createIterator(
  target: Map<unknown, unknown> | Set<unknown>,
  method: PropertyKey,
): IterableIterator<unknown> {
  const targetIsMap = isMap(target);
  const isPair = method === "entries" || (method === Symbol.iterator && targetIsMap);
  const keyOnly = targetIsMap && method === "keys";
  const iterationKey = keyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY;

  track(target, iterationKey);

  const iterator = Reflect.apply(
    Reflect.get(target, method, target) as (...args: unknown[]) => Iterator<unknown>,
    target,
    [],
  ) as Iterator<unknown>;

  return {
    next() {
      const result = iterator.next();
      if (result.done) return result;

      if (isPair) {
        const pair = result.value as [unknown, unknown];
        return {
          done: false,
          value: [toReactive(pair[0]), toReactive(pair[1])],
        };
      }

      return {
        done: false,
        value: toReactive(result.value),
      };
    },

    [Symbol.iterator]() {
      return this;
    },
  };
}

function createMapHandlers(): ProxyHandler<Map<unknown, unknown>> {
  return {
    get(target, key) {
      if (key === "size") {
        track(target, ITERATE_KEY);
        return target.size;
      }

      if (key === "get") {
        return (mapKey: unknown) => {
          const rawKey = toRaw(mapKey);
          track(target, rawKey);
          return toReactive(target.get(rawKey));
        };
      }

      if (key === "has") {
        return (mapKey: unknown) => {
          const rawKey = toRaw(mapKey);
          track(target, rawKey);
          return target.has(rawKey);
        };
      }

      if (key === "set") {
        return (mapKey: unknown, value: unknown) =>
          batch(() => {
            const rawKey = toRaw(mapKey);
            const rawValue = toRaw(value);
            const hadKey = target.has(rawKey);
            const previous = target.get(rawKey);

            target.set(rawKey, rawValue);

            if (!hadKey) {
              trigger(target, rawKey);
              trigger(target, ITERATE_KEY);
              trigger(target, MAP_KEY_ITERATE_KEY);
            } else if (!Object.is(previous, rawValue)) {
              trigger(target, rawKey);
              trigger(target, ITERATE_KEY);
            }

            return receiverFor(target);
          });
      }

      if (key === "delete") {
        return (mapKey: unknown) =>
          batch(() => {
            const rawKey = toRaw(mapKey);
            const hadKey = target.has(rawKey);
            const result = target.delete(rawKey);

            if (hadKey && result) {
              trigger(target, rawKey);
              trigger(target, ITERATE_KEY);
              trigger(target, MAP_KEY_ITERATE_KEY);
            }

            return result;
          });
      }

      if (key === "clear") {
        return () =>
          batch(() => {
            if (target.size === 0) return undefined;
            target.clear();
            triggerAll(target);
            return undefined;
          });
      }

      if (key === "forEach") {
        return (callback: (value: unknown, key: unknown, map: Map<unknown, unknown>) => void, thisArg?: unknown) => {
          track(target, ITERATE_KEY);
          target.forEach((value, mapKey) => {
            callback.call(thisArg, toReactive(value), toReactive(mapKey), receiverFor(target) as Map<unknown, unknown>);
          });
        };
      }

      if (key === "keys" || key === "values" || key === "entries" || key === Symbol.iterator) {
        return () => createIterator(target, key);
      }

      return Reflect.get(target, key, target);
    },
  };
}

function createSetHandlers(): ProxyHandler<Set<unknown>> {
  return {
    get(target, key) {
      if (key === "size") {
        track(target, ITERATE_KEY);
        return target.size;
      }

      if (key === "has") {
        return (value: unknown) => {
          const rawValue = toRaw(value);
          track(target, rawValue);
          return target.has(rawValue);
        };
      }

      if (key === "add") {
        return (value: unknown) =>
          batch(() => {
            const rawValue = toRaw(value);
            const hadValue = target.has(rawValue);
            target.add(rawValue);

            if (!hadValue) {
              trigger(target, rawValue);
              trigger(target, ITERATE_KEY);
            }

            return receiverFor(target);
          });
      }

      if (key === "delete") {
        return (value: unknown) =>
          batch(() => {
            const rawValue = toRaw(value);
            const hadValue = target.has(rawValue);
            const result = target.delete(rawValue);

            if (hadValue && result) {
              trigger(target, rawValue);
              trigger(target, ITERATE_KEY);
            }

            return result;
          });
      }

      if (key === "clear") {
        return () =>
          batch(() => {
            if (target.size === 0) return undefined;
            target.clear();
            triggerAll(target);
            return undefined;
          });
      }

      if (key === "forEach") {
        return (callback: (value: unknown, key: unknown, set: Set<unknown>) => void, thisArg?: unknown) => {
          track(target, ITERATE_KEY);
          target.forEach((value) => {
            const reactiveValue = toReactive(value);
            callback.call(thisArg, reactiveValue, reactiveValue, receiverFor(target) as Set<unknown>);
          });
        };
      }

      if (key === "keys" || key === "values" || key === "entries" || key === Symbol.iterator) {
        return () => createIterator(target, key);
      }

      return Reflect.get(target, key, target);
    },
  };
}

function receiverFor(target: object): object {
  return rawToReactive.get(target) ?? target;
}

function createReactiveObject<T extends object>(target: T, beforeRead?: () => void): T {
  const raw = toRaw(target);
  if (!isProxyable(raw)) return target;

  const existing = rawToReactive.get(raw);
  if (existing && !beforeRead) return existing as T;

  const handlers = Array.isArray(raw)
    ? createArrayHandlers(beforeRead)
    : isMap(raw)
      ? (createMapHandlers() as ProxyHandler<object>)
      : isSet(raw)
        ? (createSetHandlers() as ProxyHandler<object>)
        : createObjectHandlers(beforeRead);

  const proxy = new Proxy(raw, handlers);
  rawToReactive.set(raw, proxy);
  reactiveToRaw.set(proxy, raw);
  return proxy as T;
}

function reconcile(target: object, next: object): boolean {
  let changed = false;

  if (Array.isArray(target) && Array.isArray(next)) {
    batch(() => {
      for (let index = 0; index < target.length; index++) {
        if (index >= next.length) {
          Reflect.deleteProperty(target, String(index));
          triggerDeleted(target, String(index));
          changed = true;
        }
      }

      const previousLength = target.length;
      target.length = next.length;

      if (previousLength !== next.length) {
        triggerArrayLength(target, next.length, ARRAY_ITERATE_KEY);
        changed = true;
      }

      for (let index = 0; index < next.length; index++) {
        const previous = target[index];
        const value = toRaw(next[index]);

        if (isPlainObject(previous) && isPlainObject(value)) {
          if (reconcile(previous, value)) {
            changed = true;

            // A consumer may depend on the array slot rather than the
            // nested object's individual fields (for example, a mapped
            // JSX expression). Preserve the object identity but invalidate
            // that slot so the containing expression is evaluated again.
            trigger(target, String(index));
            trigger(target, ARRAY_ITERATE_KEY);
          }
        } else if (Array.isArray(previous) && Array.isArray(value)) {
          if (reconcile(previous, value)) {
            changed = true;
            trigger(target, String(index));
            trigger(target, ARRAY_ITERATE_KEY);
          }
        } else if (!Object.is(previous, value)) {
          target[index] = value;
          triggerChanged(target, String(index), value, previous);
          changed = true;
        }
      }
    });

    return changed;
  }

  if (!isPlainObject(target) || !isPlainObject(next)) return false;

  batch(() => {
    for (const key of Reflect.ownKeys(target)) {
      if (!hasOwn(next, key)) {
        Reflect.deleteProperty(target, key);
        triggerDeleted(target, key);
        changed = true;
      }
    }

    for (const key of Reflect.ownKeys(next)) {
      const previous = Reflect.get(target, key, target);
      const value = toRaw(Reflect.get(next, key, next));

      if (isPlainObject(previous) && isPlainObject(value)) {
        if (reconcile(previous, value)) {
          changed = true;

          // Notify consumers of the containing property too. This covers
          // render expressions that read the parent object and then traverse
          // its nested fields outside the original tracked expression.
          trigger(target, key);
        }
      } else if (Array.isArray(previous) && Array.isArray(value)) {
        if (reconcile(previous, value)) {
          changed = true;
          trigger(target, key);
        }
      } else if (!hasOwn(target, key)) {
        Reflect.set(target, key, value, target);
        triggerAdded(target, key);
        changed = true;
      } else if (!Object.is(previous, value)) {
        Reflect.set(target, key, value, target);
        triggerChanged(target, key, value, previous);
        changed = true;
      }
    }
  });

  return changed;
}

export function $store<T extends object>(
  initializer: () => Promise<T>,
): Store<T>;
export function $store<T extends object>(initializer: () => T): Store<T>;
export function $store<T extends object>(
  initializer: () => T | Promise<T>,
): Store<T> {
  if (typeof initializer !== "function") {
    throw new TypeError("[vynn]: $store() requires an initializer function.");
  }

  if (Object.prototype.toString.call(initializer) !== "[object AsyncFunction]") {
    const value = initializer();

    if (value === null || typeof value !== "object") {
      throw new TypeError("[vynn]: $store() initializer must return an object.");
    }

    return createReactiveObject(value) as Store<T>;
  }

  const resource = createAsyncResource(initializer as () => Promise<T>);
  const target = Object.create(null) as Record<PropertyKey, unknown>;
  const owner = getOwner();

  const store = createReactiveObject(target, () => {
    // Reading any part of the store suspends until the initial object exists.
    // Once resolved, the resource keeps the root proxy stable across refreshes.
    resource.value;
  });

  createReactiveEffect(
    () => {
      // Do not reconcile until the current resource run has resolved.
      if (isPending(resource)) return;

      const nextValue = resource.value;

      if (!isPlainObject(nextValue)) {
        throw new TypeError("[vynn]: An async $store() initializer must resolve to a plain object.");
      }

      reconcile(target, toRaw(nextValue));
    },
    { phase: "render", owner },
  );

  registerPending(store, () => isPending(resource));

  return store as Store<T>;
}
