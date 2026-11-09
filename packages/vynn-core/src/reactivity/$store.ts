import { $renderEffect } from "./$effect";
import { createAsyncDerived } from "./async";
import { isAsyncFunction } from "./is-async-function";
import { NotReadyError } from "./not-ready-error";
import { isPending as getPending, registerPending } from "./pending";
import { isRef, type VynnReadonlyRef } from "./ref";
import { track, trigger, triggerAll, triggerArrayLength } from "./track";
import { getCurrentTransaction, transaction } from "./transaction";
import { untrack } from "./untrack";

type StoreArrayValue<T> = T extends VynnReadonlyRef<unknown> ? T : StoreValue<T>;
type StoreCollectionValue<T> = T extends VynnReadonlyRef<unknown> ? T : StoreValue<T>;

type StoreValue<T> =
  T extends VynnReadonlyRef<infer V>
    ? V
    : T extends Function | Date | Error | RegExp | Promise<unknown>
      ? T
      : T extends Map<infer K, infer V>
        ? Map<K, StoreCollectionValue<V>>
        : T extends ReadonlyMap<infer K, infer V>
          ? ReadonlyMap<K, StoreCollectionValue<V>>
          : T extends WeakMap<infer K extends object, infer V>
            ? WeakMap<K, StoreCollectionValue<V>>
            : T extends Set<infer V>
              ? Set<StoreCollectionValue<V>>
              : T extends ReadonlySet<infer V>
                ? ReadonlySet<StoreCollectionValue<V>>
                : T extends WeakSet<infer V extends WeakKey>
                  ? WeakSet<StoreCollectionValue<V> & WeakKey>
                  : T extends readonly unknown[]
                    ? { [K in keyof T]: StoreArrayValue<T[K]> }
                    : T extends object
                      ? { [K in keyof T]: StoreValue<T[K]> }
                      : T;

export type Store<T extends object> = T extends VynnReadonlyRef<unknown>
  ? T
  : StoreValue<T> & object;

const rawToReactive = new WeakMap<object, object>();
const reactiveToRaw = new WeakMap<object, object>();

const ITERATE_KEY = Symbol("vynn.store.iterate");
const ARRAY_ITERATE_KEY = Symbol("vynn.store.array-iterate");
const MAP_KEY_ITERATE_KEY = Symbol("vynn.store.map-key-iterate");
const ASYNC_READY = Symbol("vynn.async-store.ready");
const ASYNC_ERROR = Symbol("vynn.async-store.error");

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map((key) => Symbol[key as keyof SymbolConstructor])
    .filter((value): value is symbol => typeof value === "symbol"),
);

const nonTrackableKeys = new Set(["__proto__", "__v_isRef", "__isVue"]);

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

const arraySearchMethods = new Set<PropertyKey>(["includes", "indexOf", "lastIndexOf"]);
const arrayIterateMethods = new Set<PropertyKey>([
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "flat",
  "flatMap",
  "forEach",
  "map",
  "reduce",
  "reduceRight",
  "some",
  "values",
  "keys",
  "entries",
  Symbol.iterator,
]);
const arrayInstrumentationCache = new Map<PropertyKey, Function>();

type TargetKind = "common" | "collection" | "invalid";

function isObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function rawType(value: object): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function getTargetKind(value: object): TargetKind {
  if (!Object.isExtensible(value)) {
    return "invalid";
  }

  switch (rawType(value)) {
    case "Object":
    case "Array":
      return "common";
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return "collection";
    default:
      return "invalid";
  }
}

function isMap(value: object): value is Map<unknown, unknown> {
  return rawType(value) === "Map";
}

function isSet(value: object): value is Set<unknown> {
  return rawType(value) === "Set";
}

function isWeakMap(value: object): value is WeakMap<object, unknown> {
  return rawType(value) === "WeakMap";
}

function isWeakSet(value: object): value is WeakSet<object> {
  return rawType(value) === "WeakSet";
}

function isMapLike(value: object): value is Map<unknown, unknown> | WeakMap<object, unknown> {
  return isMap(value) || isWeakMap(value);
}

function isSetLike(value: object): value is Set<unknown> | WeakSet<object> {
  return isSet(value) || isWeakSet(value);
}

function isBuiltInSymbol(key: PropertyKey): boolean {
  return typeof key === "symbol" && builtInSymbols.has(key);
}

function hasOwn(target: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isArrayIndex(key: PropertyKey): key is string {
  if (typeof key !== "string" || key === "") {
    return false;
  }

  const index = Number(key);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 0xffff_ffff &&
    String(index) === key
  );
}

function hasChanged(value: unknown, oldValue: unknown): boolean {
  return !Object.is(value, oldValue);
}

function toRaw<T>(value: T): T {
  if (!isObject(value)) {
    return value;
  }

  let raw: object = value;
  let previous: object | undefined;

  while ((previous = reactiveToRaw.get(raw))) {
    raw = previous;
  }

  return raw as T;
}

function toReactive<T>(value: T): T {
  if (!isObject(value) || isRef(value)) {
    return value;
  }

  return createReactiveObject(value) as T;
}

function inTransaction<T>(callback: () => T): T {
  if (getCurrentTransaction()) {
    return callback();
  }

  let result!: T;

  transaction(() => {
    result = callback();
  });

  return result;
}

function trackGet(target: object, key: PropertyKey): void {
  if (!isBuiltInSymbol(key) && !nonTrackableKeys.has(String(key))) {
    track(target, key);
  }
}

function trackHas(target: object, key: PropertyKey): void {
  if (!isBuiltInSymbol(key)) {
    track(target, key);
  }
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

  if (isMap(target)) {
    trigger(target, MAP_KEY_ITERATE_KEY);
  }
}

function triggerChanged(
  target: object,
  key: PropertyKey,
  value: unknown,
  oldValue: unknown,
): void {
  if (!hasChanged(value, oldValue)) {
    return;
  }

  if (Array.isArray(target)) {
    if (key === "length") {
      triggerArrayLength(target, Number(value), ARRAY_ITERATE_KEY);
    } else if (isArrayIndex(key)) {
      trigger(target, key);
      trigger(target, ARRAY_ITERATE_KEY);
    }

    return;
  }

  trigger(target, key);

  if (isMap(target)) {
    trigger(target, ITERATE_KEY);
  }
}
function triggerDeleted(target: object, key: PropertyKey): void {
  trigger(target, key);

  if (Array.isArray(target)) {
    if (isArrayIndex(key)) {
      trigger(target, ARRAY_ITERATE_KEY);
    }

    return;
  }

  trigger(target, ITERATE_KEY);

  if (isMap(target)) {
    trigger(target, MAP_KEY_ITERATE_KEY);
  }
}

function getArrayInstrumentation(key: PropertyKey): Function | undefined {
  if (
    (!arrayMutatingMethods.has(key) &&
      !arraySearchMethods.has(key) &&
      !arrayIterateMethods.has(key)) ||
    !(key in Array.prototype)
  ) {
    return undefined;
  }

  const method = Reflect.get(Array.prototype, key) as unknown;
  if (typeof method !== "function") {
    return undefined;
  }

  const cached = arrayInstrumentationCache.get(key);
  if (cached) {
    return cached;
  }

  const instrumentation = function (this: unknown[], ...args: unknown[]) {
    const target = toRaw(this) as unknown[];

    if (arrayMutatingMethods.has(key)) {
      return untrack(() =>
        inTransaction(() => Reflect.apply(method, this, args)),
      );
    }

    track(target, ARRAY_ITERATE_KEY);

    if (arraySearchMethods.has(key)) {
      let result = Reflect.apply(method, target, args);

      if ((result === -1 || result === false) && args.length > 0) {
        const rawArgument = toRaw(args[0]);

        if (rawArgument !== args[0]) {
          const rawArgs = args.slice();
          rawArgs[0] = rawArgument;
          result = Reflect.apply(method, target, rawArgs);
        }
      }

      return result;
    }

    return Reflect.apply(method, this, args);
  };

  arrayInstrumentationCache.set(key, instrumentation);
  return instrumentation;
}

function createArrayHandlers(beforeRead?: () => void): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      beforeRead?.();

      const instrumentation = getArrayInstrumentation(key);
      if (instrumentation) {
        return instrumentation;
      }

      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }

      const result = Reflect.get(target, key, receiver);

      if (isBuiltInSymbol(key) || nonTrackableKeys.has(String(key))) {
        return result;
      }

      trackGet(target, key);

      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (
        descriptor &&
        !descriptor.configurable &&
        "value" in descriptor &&
        !descriptor.writable
      ) {
        return result;
      }

      if (isRef(result)) {
        return toReactive(isArrayIndex(key) ? result : result.value);
      }

      return toReactive(result);
    },

    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key, target);
      const hadKey = isArrayIndex(key)
        ? Number(key) < (target as unknown[]).length
        : hasOwn(target, key);
      const rawValue = toRaw(value);

      return inTransaction(() => {
        const result = Reflect.set(target, key, rawValue, toRaw(receiver));

        if (target === toRaw(receiver) && result) {
          if (!hadKey) {
            triggerAdded(target, key);
          } else if (hasChanged(rawValue, oldValue)) {
            triggerChanged(target, key, rawValue, oldValue);
          }
        }

        return result;
      });
    },

    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);

      return inTransaction(() => {
        const result = Reflect.deleteProperty(target, key);

        if (result && hadKey) {
          triggerDeleted(target, key);
        }

        return result;
      });
    },

    has(target, key) {
      beforeRead?.();
      const result = Reflect.has(target, key);
      trackHas(target, key);
      return result;
    },

    ownKeys(target) {
      beforeRead?.();
      track(target, "length");
      return Reflect.ownKeys(target);
    },
  };
}

function hasOwnProperty(this: object, key: unknown): boolean {
  const target = toRaw(this);
  const normalizedKey = typeof key === "symbol" ? key : String(key);

  track(target, normalizedKey);
  return hasOwn(target, normalizedKey);
}

function createObjectHandlers(beforeRead?: () => void): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      beforeRead?.();

      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }

      const result = Reflect.get(target, key, receiver);

      if (isBuiltInSymbol(key) || nonTrackableKeys.has(String(key))) {
        return result;
      }

      trackGet(target, key);

      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (
        descriptor &&
        !descriptor.configurable &&
        "value" in descriptor &&
        !descriptor.writable
      ) {
        return result;
      }

      if (isRef(result)) {
        return toReactive(result.value);
      }

      return toReactive(result);
    },

    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key, target);

      // Like Vue, assigning through an object property updates an existing
      // ref instead of replacing it. Arrays and collections keep refs intact.
      if (isRef(oldValue) && !isRef(value)) {
        // A readonly computed ref has no setter; Reflect.set keeps that a
        // no-op instead of throwing in strict-mode callers.
        Reflect.set(oldValue, "value", value);
        return true;
      }

      const hadKey = hasOwn(target, key);
      const rawValue = toRaw(value);

      return inTransaction(() => {
        const result = Reflect.set(target, key, rawValue, toRaw(receiver));

        if (target === toRaw(receiver) && result) {
          if (!hadKey) {
            triggerAdded(target, key);
          } else if (hasChanged(rawValue, oldValue)) {
            triggerChanged(target, key, rawValue, oldValue);
          }
        }

        return result;
      });
    },

    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);

      return inTransaction(() => {
        const result = Reflect.deleteProperty(target, key);

        if (result && hadKey) {
          triggerDeleted(target, key);
        }

        return result;
      });
    },

    has(target, key) {
      beforeRead?.();
      const result = Reflect.has(target, key);
      trackHas(target, key);
      return result;
    },

    ownKeys(target) {
      beforeRead?.();
      track(target, ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
  };
}

function createCollectionIterator(
  target: object,
  method: PropertyKey,
): IterableIterator<unknown> {
  const targetIsMap = isMap(target);
  const isPair = method === "entries" || (method === Symbol.iterator && targetIsMap);
  const isKeyOnly = method === "keys" && targetIsMap;

  track(target, isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);

  const iterator = Reflect.apply(
    Reflect.get(target, method, target) as (...args: unknown[]) => Iterator<unknown>,
    target,
    [],
  ) as Iterator<unknown>;

  return {
    next() {
      const result = iterator.next();

      if (result.done) {
        return result;
      }

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

function createCollectionHandlers(): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      if (key === "size" && (isMap(target) || isSet(target))) {
        track(target, ITERATE_KEY);
        return Reflect.get(target, key, target);
      }

      if (key === "get" && isMapLike(target)) {
        return (keyValue: unknown) => {
          const rawKey = toRaw(keyValue);
          if (rawKey !== keyValue) {
            track(target, keyValue);
          }
          track(target, rawKey);

          const resolvedKey = target.has(keyValue as never) ? keyValue : rawKey;
          return toReactive(target.get(resolvedKey as never));
        };
      }

      if (key === "has" && (isMapLike(target) || isSetLike(target))) {
        return (keyValue: unknown) => {
          const rawKey = toRaw(keyValue);
          if (rawKey !== keyValue) {
            track(target, keyValue);
          }
          track(target, rawKey);

          return target.has(keyValue as never) || target.has(rawKey as never);
        };
      }

      if (key === "set" && isMapLike(target)) {
        return (keyValue: unknown, value: unknown) =>
          inTransaction(() => {
            const rawKey = toRaw(keyValue);
            const rawValue = toRaw(value);
            const resolvedKey = target.has(keyValue as never) ? keyValue : rawKey;
            const hadKey = target.has(resolvedKey as never);
            const oldValue = target.get(resolvedKey as never);

            target.set(resolvedKey as never, rawValue as never);

            if (!hadKey) {
              trigger(target, resolvedKey);
              if (isMap(target)) {
                trigger(target, ITERATE_KEY);
                trigger(target, MAP_KEY_ITERATE_KEY);
              }
            } else if (hasChanged(rawValue, oldValue)) {
              trigger(target, resolvedKey);
              if (isMap(target)) {
                trigger(target, ITERATE_KEY);
              }
            }

            return receiver;
          });
      }

      if (key === "add" && isSetLike(target)) {
        return (value: unknown) =>
          inTransaction(() => {
            const rawValue = toRaw(value);
            const hadValue =
              target.has(value as never) || target.has(rawValue as never);

            if (!hadValue) {
              target.add(rawValue as never);
              trigger(target, rawValue);

              if (isSet(target)) {
                trigger(target, ITERATE_KEY);
              }
            }

            return receiver;
          });
      }

      if (key === "delete" && (isMapLike(target) || isSetLike(target))) {
        return (keyValue: unknown) =>
          inTransaction(() => {
            const rawKey = toRaw(keyValue);
            const resolvedKey = target.has(keyValue as never) ? keyValue : rawKey;
            const hadKey = target.has(resolvedKey as never);
            const result = target.delete(resolvedKey as never);

            if (result && hadKey) {
              trigger(target, resolvedKey as PropertyKey);

              if (isMap(target)) {
                trigger(target, ITERATE_KEY);
                trigger(target, MAP_KEY_ITERATE_KEY);
              } else if (isSet(target)) {
                trigger(target, ITERATE_KEY);
              }
            }

            return result;
          });
      }

      if (key === "clear" && (isMap(target) || isSet(target))) {
        return () =>
          inTransaction(() => {
            const hadItems = target.size > 0;
            target.clear();

            if (hadItems) {
              triggerAll(target);
            }
          });
      }

      if (key === "forEach" && (isMap(target) || isSet(target))) {
        return (callback: (value: unknown, key: unknown, collection: object) => void, thisArg?: unknown) => {
          track(target, ITERATE_KEY);

          return Reflect.apply(
            Reflect.get(target, "forEach", target) as Function,
            target,
            [
              (value: unknown, entryKey: unknown) => {
                callback.call(thisArg, toReactive(value), toReactive(entryKey), receiver);
              },
            ],
          );
        };
      }

      if (
        (key === "keys" && (isMap(target) || isSet(target))) ||
        (key === "values" && (isMap(target) || isSet(target))) ||
        (key === "entries" && (isMap(target) || isSet(target))) ||
        (key === Symbol.iterator && (isMap(target) || isSet(target)))
      ) {
        return () => createCollectionIterator(target, key);
      }

      const result = Reflect.get(target, key, target);
      trackGet(target, key);
      return toReactive(result);
    },
  };
}

/**
 * Creates a Vue-style deeply reactive proxy.
 *
 * Objects and arrays use property handlers; Map, Set, WeakMap, and WeakSet
 * use collection-specific methods. Unsupported built-ins such as Date remain
 * raw, matching the target types supported by Vue's reactive() API.
 */
function createReactiveObject<T extends object>(
  value: T,
  beforeRead?: () => void,
): T {
  if (isRef(value)) {
    return value as T;
  }

  if (reactiveToRaw.has(value)) {
    return value;
  }

  const target = toRaw(value);
  const existingProxy = rawToReactive.get(target);

  if (existingProxy) {
    return existingProxy as T;
  }

  const targetKind = getTargetKind(target);
  if (targetKind === "invalid") {
    return target as T;
  }

  const proxy = new Proxy(
    target,
    targetKind === "collection"
      ? createCollectionHandlers()
      : Array.isArray(target)
        ? createArrayHandlers(beforeRead)
        : createObjectHandlers(beforeRead),
  );

  rawToReactive.set(target, proxy);
  reactiveToRaw.set(proxy, target);

  return proxy as T;
}

/**
 * Creates a deeply reactive store.
 *
 * Nested objects and arrays are converted lazily. Map, Set, WeakMap, and
 * WeakSet use reactive collection methods. Ref-like Vynn values are unwrapped
 * on ordinary object properties, but remain refs in arrays and collections.
 *
 * Property reads, existence checks, and iteration are tracked independently.
 * Additions, updates, and deletions only notify the dependencies affected by
 * that operation. Mutating array methods run without collecting dependencies
 * from their internal bookkeeping reads.
 *
 * Passing an async function creates a writable async-derived store. Its
 * resolved plain-object snapshots are reconciled into the same root proxy.
 *
 * @template T The object type.
 * @param initialObject The initial object or async initializer.
 * @returns A deeply reactive proxy of the object.
 */
export function $store<T extends object>(initialObject: () => Promise<T>): Store<T>;

export function $store<T extends object>(initialObject: T): Store<T>;

export function $store<T extends object>(
  initialObject: T | (() => Promise<T>),
): Store<T> {
  if (isAsyncFunction(initialObject)) {
    return createAsyncStore(initialObject as () => Promise<T>);
  }

  return createReactiveObject(initialObject as T) as Store<T>;
}

function createAsyncStore<T extends object>(getter: () => Promise<T>): Store<T> {
  const target: Record<PropertyKey, unknown> = {};
  const resource = createAsyncDerived(getter);

  let ready = false;
  let error: unknown;
  let hasError = false;

  const setError = (nextError: unknown) => {
    if (hasError && Object.is(error, nextError)) {
      return;
    }

    error = nextError;
    hasError = true;
    trigger(target, ASYNC_ERROR);
  };

  const clearError = () => {
    if (!hasError) {
      return;
    }

    error = undefined;
    hasError = false;
    trigger(target, ASYNC_ERROR);
  };

  const store = createReactiveObject(target, () => {
    track(target, ASYNC_ERROR);

    if (hasError) {
      throw error;
    }

    if (!ready) {
      track(target, ASYNC_READY);

      // Start/suspend the initial read without making store consumers depend
      // on the resource's whole-value signal. Once ready, property updates
      // remain granular.
      untrack(() => resource.value);
    }
  }) as unknown as Store<T>;

  // The resource owns dependency tracking and request versioning. This
  // render effect only commits resolved snapshots into the stable store.
  $renderEffect(() => {
    if (getPending(resource)) {
      clearError();

      if (!ready) {
        try {
          // oxlint-disable-next-line no-unused-expressions
          resource.value;
        } catch (nextError) {
          if (!(nextError instanceof NotReadyError)) {
            setError(nextError);
          }
        }
      }

      return;
    }

    try {
      const nextValue = resource.value;

      if (!isPlainObject(nextValue)) {
        throw new TypeError("$store async initializer must resolve to a plain object.");
      }

      reconcileObject(target, nextValue);

      if (!ready) {
        ready = true;
        trigger(target, ASYNC_READY);
      }

      clearError();
    } catch (nextError) {
      if (!(nextError instanceof NotReadyError)) {
        setError(nextError);
      }
    }
  });

  registerPending(store, () => getPending(resource));

  return store;
}

/**
 * Applies a resolved snapshot without replacing existing compatible objects.
 * This keeps the root and nested proxies stable across async refreshes.
 */
function reconcileObject(target: object, source: object): boolean {
  if (Array.isArray(target) && Array.isArray(source)) {
    return reconcileArray(target, source);
  }

  const targetRecord = target as Record<PropertyKey, unknown>;
  const sourceRecord = source as Record<PropertyKey, unknown>;
  const sourceKeys = new Set(Reflect.ownKeys(source));
  let changed = false;

  for (const key of Reflect.ownKeys(target)) {
    if (!sourceKeys.has(key) && Reflect.deleteProperty(target, key)) {
      triggerDeleted(target, key);
      changed = true;
    }
  }

  for (const key of sourceKeys) {
    const nextValue = toRaw(sourceRecord[key]);

    if (!hasOwn(target, key)) {
      Reflect.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        value: nextValue,
        writable: true,
      });

      triggerAdded(target, key);
      changed = true;
      continue;
    }

    const currentValue = targetRecord[key];

    if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
      if (reconcileArray(currentValue, nextValue)) {
        triggerChanged(target, key, nextValue, currentValue);
        changed = true;
      }

      continue;
    }

    if (canReconcile(currentValue, nextValue)) {
      if (reconcileObject(currentValue, nextValue as object)) {
        changed = true;
      }

      continue;
    }

    if (hasChanged(currentValue, nextValue)) {
      Reflect.set(target, key, nextValue);
      triggerChanged(target, key, nextValue, currentValue);
      changed = true;
    }
  }

  return changed;
}

function reconcileArray(target: unknown[], source: unknown[]): boolean {
  const previousLength = target.length;
  const sourceIndexKeys = new Set(Reflect.ownKeys(source).filter(isArrayIndex));
  let changed = false;

  for (const key of Reflect.ownKeys(target).filter(isArrayIndex)) {
    const index = Number(key);

    if (index >= source.length || !sourceIndexKeys.has(key)) {
      if (Reflect.deleteProperty(target, key)) {
        triggerDeleted(target, key);
        changed = true;
      }

      continue;
    }

    const nextValue = toRaw(source[index]);
    const currentValue = target[index];

    if (hasChanged(nextValue, currentValue)) {
      Reflect.set(target, key, nextValue);
      triggerChanged(target, key, nextValue, currentValue);
      changed = true;
    }
  }

  for (const key of sourceIndexKeys) {
    if (!hasOwn(target, key)) {
      const index = Number(key);
      const nextValue = toRaw(source[index]);
      const oldValue = target[index];
      const hadIndex = index < target.length;

      Reflect.set(target, key, nextValue);

      if (hadIndex) {
        triggerChanged(target, key, nextValue, oldValue);
      } else {
        triggerAdded(target, key);
      }

      changed = true;
    }
  }

  if (previousLength !== source.length) {
    target.length = source.length;
    triggerChanged(target, "length", source.length, previousLength);
    changed = true;
  }

  return changed;
}

function canReconcile(current: unknown, next: unknown): current is object {
  if (!isObject(current) || !isObject(next)) {
    return false;
  }

  if (Array.isArray(current) || Array.isArray(next)) {
    return Array.isArray(current) && Array.isArray(next);
  }

  return isPlainObject(current) && isPlainObject(next);
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
