import { $renderEffect } from "./effect";
import { $computed, isAsyncComputed, type Computed } from "./computed";
import {
  batch,
  isTracking,
  node,
  notify,
  setSourceUnobservedHandler,
  track,
  untrack,
  assertNotInComputedGetter,
  type Source,
} from "./graph";
import { PendingReadError } from "./async/pending-error";
import { getPendingPromise, isPendingInternal, registerPending } from "./async/pending";
import { isRef, isWritableRef, type ReactiveRef } from "./ref";


type StoreArrayValue<T> = T extends ReactiveRef<unknown> ? T : StoreValue<T>;
type StoreCollectionValue<T> = T extends ReactiveRef<unknown> ? T : StoreValue<T>;

export type StoreValue<T> =
  T extends ReactiveRef<infer Value>
    ? Value
    : T extends Function | Date | Error | RegExp | PromiseLike<unknown>
      ? T
      : T extends WeakMap<infer Key extends object, infer Value>
        ? WeakMap<Key, Value>
        : T extends WeakSet<infer Value extends object>
          ? WeakSet<Value>
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

const ITERATE = Symbol("store.iterate");
const ARRAY_ITERATE = Symbol("store.array-iterate");
const MAP_KEYS = Symbol("store.map-keys");
const mutators = new Set<PropertyKey>([
  "copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift",
]);

type Collection = Map<unknown, unknown> | Set<unknown> | WeakMap<object, unknown> | WeakSet<object>;

const rawToProxy = new WeakMap<object, object>();
const proxyToRaw = new WeakMap<object, object>();
const dependencies = new WeakMap<object, Map<unknown, Source>>();
let suppressedStoreNotifications = 0;

function releaseStoreSource(source: Source): void {
  const target = source.storeTarget;
  if (target === undefined) return;

  const targetDependencies = dependencies.get(target);
  if (targetDependencies?.get(source.storeKey) !== source) return;

  targetDependencies.delete(source.storeKey);
  if (targetDependencies.size === 0) dependencies.delete(target);
}

setSourceUnobservedHandler(releaseStoreSource);

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isArrayIndex(key: PropertyKey): boolean {
  if (typeof key !== "string" || key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && String(index) === key;
}

function hasOwn(target: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isProxyable(value: object): boolean {
  return Array.isArray(value) || isPlainObject(value) || value instanceof Map || value instanceof Set || value instanceof WeakMap || value instanceof WeakSet;
}

function toRaw<T>(value: T): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }

  let current = value as object;
  let previous: object | undefined;
  while ((previous = proxyToRaw.get(current))) current = previous;
  return current as T;
}

function sourceFor(target: object, key: unknown): Source {
  let targetDependencies = dependencies.get(target);
  if (!targetDependencies) {
    targetDependencies = new Map();
    dependencies.set(target, targetDependencies);
  }

  let source = targetDependencies.get(key);
  if (!source) {
    source = node(target, key);
    targetDependencies.set(key, source);
  }
  return source;
}

function trackKey(target: object, key: unknown): void {
  if (isTracking()) track(sourceFor(target, key));
}

function triggerKey(target: object, key: unknown): void {
  if (suppressedStoreNotifications > 0) return;
  const source = dependencies.get(target)?.get(key);
  if (source) notify(source);
}

function triggerAll(target: object): void {
  if (suppressedStoreNotifications > 0) return;
  for (const source of dependencies.get(target)?.values() ?? []) notify(source);
}

function toReactive<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    isRef(value) ||
    !isProxyable(value)
  ) {
    return value;
  }

  return createReactiveObject(value) as T;
}

function triggerAdded(target: object, key: PropertyKey, oldLength?: number): void {
  if (suppressedStoreNotifications > 0) return;
  triggerKey(target, key);
  if (Array.isArray(target)) {
    triggerKey(target, ARRAY_ITERATE);
    if (isArrayIndex(key) && oldLength !== undefined && Number(key) >= oldLength) {
      triggerKey(target, "length");
    }
  } else {
    triggerKey(target, ITERATE);
  }
}

function triggerChanged(
  target: object,
  key: PropertyKey,
  next: unknown,
  previous: unknown,
  oldLength?: number,
): void {
  if (suppressedStoreNotifications > 0 || Object.is(next, previous)) return;

  if (Array.isArray(target) && key === "length") {
    const length = Number(next);
    triggerKey(target, "length");

    if (oldLength !== undefined && length < oldLength) {
      triggerKey(target, ARRAY_ITERATE);
      for (const [dependencyKey, source] of dependencies.get(target) ?? []) {
        if (isArrayIndex(dependencyKey as PropertyKey) && Number(dependencyKey) >= length) {
          notify(source);
        }
      }
    }
    return;
  }

  triggerKey(target, key);
}

function triggerDeleted(target: object, key: PropertyKey): void {
  if (suppressedStoreNotifications > 0) return;
  triggerKey(target, key);
  triggerKey(target, Array.isArray(target) ? ARRAY_ITERATE : ITERATE);
}

function ownHasProperty(this: object, key: PropertyKey): boolean {
  const target = toRaw(this);
  trackKey(target, key);
  return hasOwn(target, key);
}

function objectHandlers(beforeRead?: () => void): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      beforeRead?.();
      if (key === "hasOwnProperty") return ownHasProperty;

      const value = Reflect.get(target, key, receiver);
      if (typeof key === "symbol" && key === Symbol.toStringTag) return value;
      trackKey(target, key);

      if (Array.isArray(target) && isArrayIndex(key) && isRef(value)) return value;

      if (Array.isArray(target) && (key === "includes" || key === "indexOf" || key === "lastIndexOf")) {
        return (...args: unknown[]) => {
          const method = value as (...items: unknown[]) => unknown;
          const result = Reflect.apply(method, receiver, args);
          if (result === false || result === -1) {
            return Reflect.apply(method, target, args.map(argument => toRaw(argument)));
          }
          return result;
        };
      }

      if (Array.isArray(target) && typeof value === "function" && mutators.has(key)) {
        return (...args: unknown[]) =>
          untrack(() => batch(() => Reflect.apply(
            value,
            receiver,
            args.map(argument => toRaw(argument)),
          )));
      }

      if (isRef(value)) return toReactive(value.value);
      return toReactive(value);
    },

    set(target, key, value) {
      const previous = Reflect.get(target, key, target);
      if (!Array.isArray(target) && isWritableRef(previous) && !isRef(value)) {
        previous.value = value;
        return true;
      }
      if (
        !Array.isArray(target) &&
        isRef(previous) &&
        !isWritableRef(previous) &&
        !isRef(value)
      ) {
        return true;
      }

      const hadKey = hasOwn(target, key);
      const oldLength = Array.isArray(target) ? target.length : undefined;
      const rawValue = toRaw(value);

      return batch(() => {
        const result = Reflect.set(target, key, rawValue, target);
        if (result) {
          if (!hadKey) triggerAdded(target, key, oldLength);
          else triggerChanged(target, key, rawValue, previous, oldLength);
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

    defineProperty(target, key, descriptor) {
      const hadKey = hasOwn(target, key);
      const previousDescriptor = Reflect.getOwnPropertyDescriptor(target, key);
      const previous = Reflect.get(target, key, target);
      const oldLength = Array.isArray(target) ? target.length : undefined;

      return batch(() => {
        const result = Reflect.defineProperty(target, key, descriptor);
        if (!result) return false;

        const next = Reflect.get(target, key, target);
        const nextDescriptor = Reflect.getOwnPropertyDescriptor(target, key);

        if (!hadKey) triggerAdded(target, key, oldLength);
        else if (
          !Object.is(previous, next) ||
          previousDescriptor?.get !== nextDescriptor?.get ||
          previousDescriptor?.set !== nextDescriptor?.set
        ) {
          triggerChanged(target, key, next, previous, oldLength);
        }

        if (hadKey && previousDescriptor?.enumerable !== nextDescriptor?.enumerable) {
          triggerKey(target, Array.isArray(target) ? ARRAY_ITERATE : ITERATE);
        }
        return true;
      });
    },

    has(target, key) {
      beforeRead?.();
      trackKey(target, key);
      return Reflect.has(target, key);
    },

    ownKeys(target) {
      beforeRead?.();
      trackKey(target, Array.isArray(target) ? ARRAY_ITERATE : ITERATE);
      return Reflect.ownKeys(target);
    },
  };
}

function collectionIterator(target: Map<unknown, unknown> | Set<unknown>, method: PropertyKey): IterableIterator<unknown> {
  const isMap = target instanceof Map;
  trackKey(target, isMap && method === "keys" ? MAP_KEYS : ITERATE);

  const iterator = Reflect.apply(
    Reflect.get(target, method, target) as (...args: never[]) => Iterator<unknown>,
    target,
    [],
  );

  return {
    next() {
      const result = iterator.next();
      if (result.done) return result;

      if ((isMap && (method === "entries" || method === Symbol.iterator)) ||
          (!isMap && method === "entries")) {
        const [first, second] = result.value as [unknown, unknown];
        return { done: false, value: [toReactive(first), toReactive(second)] };
      }

      return { done: false, value: toReactive(result.value) };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

function collectionHandlers(): ProxyHandler<object> {
  return {
    get(target, key) {
      const isMap = target instanceof Map;
      const isSet = target instanceof Set;
      const isWeakMap = target instanceof WeakMap;
      const isWeakSet = target instanceof WeakSet;
      const isMapLike = isMap || isWeakMap;
      const isSetLike = isSet || isWeakSet;
      const collection = target as Collection;

      if (key === "size" && (isMap || isSet)) {
        trackKey(target, isMap ? MAP_KEYS : ITERATE);
        return (target as Map<unknown, unknown> | Set<unknown>).size;
      }

      if (key === "get" && isMapLike) {
        return (mapKey: unknown) => {
          const rawKey = toRaw(mapKey);
          trackKey(target, rawKey);
          return toReactive((target as Map<unknown, unknown> | WeakMap<object, unknown>).get(rawKey as object));
        };
      }

      if (key === "has") {
        return (item: unknown) => {
          const rawItem = toRaw(item);
          trackKey(target, rawItem);
          return collection.has(rawItem as object);
        };
      }

      if (key === "set" && isMapLike) {
        return (mapKey: unknown, value: unknown) => batch(() => {
          const map = target as Map<unknown, unknown> | WeakMap<object, unknown>;
          const rawKey = toRaw(mapKey);
          const rawValue = toRaw(value);
          const existed = map.has(rawKey as object);
          const previous = map.get(rawKey as object);
          map.set(rawKey as object, rawValue);

          if (!existed) {
            triggerKey(target, rawKey);
            if (isMap) {
              triggerKey(target, ITERATE);
              triggerKey(target, MAP_KEYS);
            }
          } else if (!Object.is(previous, rawValue)) {
            triggerKey(target, rawKey);
            if (isMap) triggerKey(target, ITERATE);
          }

          return rawToProxy.get(target) ?? target;
        });
      }

      if (key === "add" && isSetLike) {
        return (value: unknown) => batch(() => {
          const set = target as Set<unknown> | WeakSet<object>;
          const rawValue = toRaw(value);
          const existed = set.has(rawValue as object);
          set.add(rawValue as object);
          if (!existed) {
            triggerKey(target, rawValue);
            if (isSet) triggerKey(target, ITERATE);
          }
          return rawToProxy.get(target) ?? target;
        });
      }

      if (key === "delete") {
        return (item: unknown) => batch(() => {
          const rawItem = toRaw(item);
          const existed = collection.has(rawItem as object);
          const result = collection.delete(rawItem as object);
          if (existed && result) {
            triggerKey(target, rawItem);
            if (isMap || isSet) triggerKey(target, ITERATE);
            if (isMap) triggerKey(target, MAP_KEYS);
          }
          return result;
        });
      }

      if (key === "clear" && (isMap || isSet)) {
        return () => batch(() => {
          const strongCollection = target as Map<unknown, unknown> | Set<unknown>;
          if (strongCollection.size === 0) return;
          strongCollection.clear();
          triggerAll(target);
        });
      }

      if (key === "forEach" && (isMap || isSet)) {
        return (callback: (value: unknown, key: unknown, collection: unknown) => void, thisArg?: unknown) => {
          trackKey(target, ITERATE);
          if (isMap) {
            (target as Map<unknown, unknown>).forEach((value, mapKey) => {
              callback.call(thisArg, toReactive(value), toReactive(mapKey), rawToProxy.get(target) ?? target);
            });
          } else {
            (target as Set<unknown>).forEach(value => {
              const reactiveValue = toReactive(value);
              callback.call(thisArg, reactiveValue, reactiveValue, rawToProxy.get(target) ?? target);
            });
          }
        };
      }

      if ((key === "keys" || key === "values" || key === "entries" || key === Symbol.iterator) && (isMap || isSet)) {
        return () => collectionIterator(target as Map<unknown, unknown> | Set<unknown>, key);
      }

      return Reflect.get(target, key, target);
    },
  };
}

const sharedObjectHandlers = objectHandlers();
const sharedCollectionHandlers = collectionHandlers();

function createReactiveObject<T extends object>(
  target: T,
  beforeRead?: () => void,
): T {
  const raw = toRaw(target);
  if (!isProxyable(raw)) return raw;

  const existing = rawToProxy.get(raw);
  if (existing && !beforeRead) return existing as T;

  const isCollection =
    raw instanceof Map ||
    raw instanceof Set ||
    raw instanceof WeakMap ||
    raw instanceof WeakSet;
  const handlers = isCollection
    ? sharedCollectionHandlers
    : beforeRead
      ? objectHandlers(beforeRead)
      : sharedObjectHandlers;

  const proxy = new Proxy(raw, handlers);
  rawToProxy.set(raw, proxy);
  proxyToRaw.set(proxy, raw);
  return proxy as T;
}

function reconcile(target: object, next: object): boolean {
  if (Array.isArray(target) && Array.isArray(next)) {
    let changed = false;

    batch(() => {
      for (let index = next.length; index < target.length; index++) {
        const key = String(index);
        if (hasOwn(target, key)) {
          Reflect.deleteProperty(target, key);
          triggerDeleted(target, key);
          changed = true;
        }
      }

      const oldLength = target.length;
      target.length = next.length;
      if (oldLength !== next.length) {
        triggerChanged(target, "length", next.length, oldLength, oldLength);
        changed = true;
      }

      for (let index = 0; index < next.length; index++) {
        const key = String(index);
        const previous = target[index];
        const value = toRaw(next[index]);

        if (
          (isPlainObject(previous) && isPlainObject(value)) ||
          (Array.isArray(previous) && Array.isArray(value))
        ) {
          if (reconcile(previous, value)) {
            triggerKey(target, key);
            changed = true;
          }
        } else if (!Object.is(previous, value) || !hasOwn(target, key)) {
          const existed = hasOwn(target, key);
          target[index] = value;
          if (existed) triggerChanged(target, key, value, previous);
          else triggerAdded(target, key, oldLength);
          changed = true;
        }
      }
    });

    return changed;
  }

  if (!isPlainObject(target) || !isPlainObject(next)) return false;
  let changed = false;

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
      const existed = hasOwn(target, key);

      if (
        existed &&
        ((isPlainObject(previous) && isPlainObject(value)) ||
          (Array.isArray(previous) && Array.isArray(value)))
      ) {
        if (reconcile(previous, value)) {
          triggerKey(target, key);
          changed = true;
        }
      } else if (!existed || !Object.is(previous, value)) {
        Reflect.set(target, key, value, target);
        if (existed) triggerChanged(target, key, value, previous);
        else triggerAdded(target, key);
        changed = true;
      }
    }
  });

  return changed;
}

function assertStoreObject<T extends object>(value: T): T {
  if (value === null || typeof value !== "object") {
    throw new TypeError("[vynn]: $store() expects an object value.");
  }
  return value;
}

function createAsyncStore<T extends object>(initial: Computed<T>): Store<T> {
  const target = Object.create(null) as Record<PropertyKey, unknown>;
  const rootStatus = node();
  let rootError: unknown;
  let hasRootError = false;
  let hasSyncedValue = false;
  let syncedValue: T | undefined;
  let updatePending = () => {};

  const syncFromInitial = (notifyObservers: boolean): boolean => {
    const next = initial.value;
    if (!isPlainObject(next)) {
      throw new TypeError("[vynn]: An async $store() initializer must resolve to a plain object.");
    }

    if (hasSyncedValue && Object.is(syncedValue, next)) return false;

    if (notifyObservers) {
      reconcile(target, toRaw(next));
    } else {
      // A store read can be the first consumer to observe an already-resolved
      // owner-independent resource. Repair the stable proxy before returning
      // the requested property, without re-notifying the computation that is
      // currently performing that read. The computed source itself schedules
      // every reactive consumer when its async value changes.
      suppressedStoreNotifications++;
      try {
        reconcile(target, toRaw(next));
      } finally {
        suppressedStoreNotifications--;
      }
    }

    syncedValue = next;
    hasSyncedValue = true;
    hasRootError = false;
    rootError = undefined;
    return true;
  };

  const store = createReactiveObject(target, () => {
    track(rootStatus);
    if (hasRootError) throw rootError;
    syncFromInitial(false);
  }) as Store<T>;

  updatePending = registerPending(
    store,
    () => isPendingInternal(initial),
    () => getPendingPromise(initial),
    true,
    () => {
      try {
        if (syncFromInitial(true)) notify(rootStatus);
      } catch {
        // Pending and failed values remain observable through normal store reads.
      }
      updatePending();
    },
  );

  $renderEffect(() => {
    const pending = isPendingInternal(initial);
    updatePending();
    if (pending) return;

    let changed = false;
    try {
      changed = syncFromInitial(true);
    } catch (cause) {
      if (cause instanceof PendingReadError) return;
      hasRootError = true;
      rootError = cause;
    }

    if (changed) notify(rootStatus);
  });

  return store;
}

export function $store<T extends object>(initializer: (signal: AbortSignal) => PromiseLike<T>): Store<T>;
export function $store<T extends object>(initializer: (signal: AbortSignal) => T): Store<T>;
export function $store<T extends object>(initializer: () => T): Store<T>;
export function $store<T extends object>(initializer: () => T | PromiseLike<T>): Store<T>;
export function $store<T extends object>(value: T): Store<T>;
export function $store<T extends object>(source?: T | ((signal: AbortSignal) => T | PromiseLike<T>)): Store<T> {
  assertNotInComputedGetter("$store");

  if (typeof source === "function") {
    const initial = $computed<T>(source as (signal: AbortSignal) => T | PromiseLike<T>);
    if (isPendingInternal(initial) || isAsyncComputed(initial)) {
      return createAsyncStore(initial);
    }

    try {
      const value = initial.value;
      if (isPlainObject(value)) return createAsyncStore(initial);
      return createReactiveObject(assertStoreObject(value)) as Store<T>;
    } catch {
      return createAsyncStore(initial);
    }
  }

  if (source === undefined || source === null || typeof source !== "object") {
    throw new TypeError("[vynn]: $store() expects an object or an initializer function.");
  }

  return createReactiveObject(assertStoreObject(source)) as Store<T>;
}
