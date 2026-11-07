import { createAsyncDerived } from "./$async";
import { $renderEffect } from "./$effect";
import { isAsyncFunction } from "./is-async-function";
import { NotReadyError } from "./not-ready-error";
import { isPending as getPending, registerPending } from "./pending";
import { track, trigger } from "./track";
import { getCurrentTransaction, transaction } from "./transaction";
import { untrack } from "./untrack";

export type Store<T extends object> = T;

const proxyMap = new WeakMap<object, unknown>();
const ASYNC_READY = Symbol("vynn.async-store.ready");
const ASYNC_ERROR = Symbol("vynn.async-store.error");

/**
 * Creates a deeply reactive proxy.
 */
function createReactiveObject<U extends object>(
  obj: U,
  beforeRead?: () => void,
): U {
  if (proxyMap.has(obj)) {
    return proxyMap.get(obj) as U;
  }

  const proxy = new Proxy(obj, {
    get(target, key, receiver) {
      beforeRead?.();
      track(target, key);

      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      const result = descriptor?.get
        ? descriptor.get.call(receiver)
        : Reflect.get(target, key, receiver);

      // Preserve `this` as the reactive proxy.
      if (typeof result === "function") {
        return result.bind(receiver);
      }

      // Deep reactivity.
      if (typeof result === "object" && result !== null) {
        return createReactiveObject(result as object);
      }

      return result;
    },

    set(target, key, value, receiver) {
      const oldValue = target[key as keyof U];
      const oldLength = Array.isArray(target) ? target.length : undefined;

      const write = () => {
        const result = Reflect.set(target, key, value, receiver);

        if (oldValue !== value) {
          trigger(target, key);
        }

        // Growing an array updates its length as a side effect of setting an
        // index. The subsequent proxy length write sees the already-updated
        // value, so explicitly notify length subscribers here.
        if (
          oldLength !== undefined &&
          key !== "length" &&
          target.length !== oldLength
        ) {
          trigger(target, "length");
        }

        return result;
      };

      if (getCurrentTransaction()) {
        return write();
      }

      let result!: boolean;

      transaction(() => {
        result = write();
      });

      return result;
    },

    deleteProperty(target, key) {
      const hadValue = Reflect.has(target, key);

      const remove = () => {
        const result = Reflect.deleteProperty(target, key);

        if (result && hadValue) {
          trigger(target, key);
        }

        return result;
      };

      if (getCurrentTransaction()) {
        return remove();
      }

      let result!: boolean;

      transaction(() => {
        result = remove();
      });

      return result;
    },

    ownKeys(target) {
      beforeRead?.();
      return Reflect.ownKeys(target);
    },

    has(target, key) {
      beforeRead?.();
      track(target, key);
      return Reflect.has(target, key);
    },
  });

  proxyMap.set(obj, proxy);

  return proxy as U;
}

/**
 * Creates a deeply reactive object.
 *
 * Property reads are tracked by the current reactive computation, and writes
 * trigger updates when the property value changes. Nested objects are also
 * made reactive when accessed.
 *
 * Writes made outside an existing transaction are automatically wrapped in
 * a transaction.
 *
 * Passing an async function creates a writable async-derived store. Its
 * resolved snapshots are reconciled into the same root store proxy.
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

  return createReactiveObject(initialObject as T);
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
      // A retry after an error makes the last committed snapshot usable again.
      clearError();

      if (!ready) {
        try {
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
    if (!sourceKeys.has(key)) {
      if (Reflect.deleteProperty(target, key)) {
        trigger(target, key);
        changed = true;
      }
    }
  }

  for (const key of sourceKeys) {
    const nextValue = sourceRecord[key];
    const currentValue = targetRecord[key];

    if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
      // Keep the collection proxy stable, but reconcile its entries by
      // replacing object snapshots. Consumers such as $for can then detect
      // changed entries even when callbacks destructure primitive fields.
      if (reconcileArray(currentValue, nextValue)) {
        trigger(target, key);
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

    if (!Object.is(currentValue, nextValue)) {
      Reflect.set(target, key, nextValue);
      trigger(target, key);
      changed = true;
    }
  }

  return changed;
}

function reconcileArray(target: unknown[], source: unknown[]): boolean {
  const previousLength = target.length;
  const commonLength = Math.min(previousLength, source.length);
  let changed = false;

  for (let index = 0; index < commonLength; index++) {
    if (!(index in source)) {
      if (index in target) {
        Reflect.deleteProperty(target, index);
        trigger(target, String(index));
        changed = true;
      }

      continue;
    }

    const nextValue = source[index];
    const currentValue = target[index];

    // Array entries are snapshot values. Replacing object entries lets
    // identity-based list reconciliation distinguish changed rows, while
    // equal snapshots can still reuse their existing DOM nodes.
    if (!Object.is(currentValue, nextValue)) {
      target[index] = nextValue;
      trigger(target, String(index));
      changed = true;
    }
  }

  for (let index = commonLength; index < source.length; index++) {
    if (index in source) {
      target[index] = source[index];
      trigger(target, String(index));
      changed = true;
    }
  }

  for (let index = source.length; index < target.length; index++) {
    if (index in target) {
      Reflect.deleteProperty(target, index);
      trigger(target, String(index));
      changed = true;
    }
  }

  if (previousLength !== source.length) {
    target.length = source.length;
    trigger(target, "length");
    changed = true;
  }

  return changed;
}

function canReconcile(current: unknown, next: unknown): current is object {
  if (current === null || next === null || typeof current !== "object" || typeof next !== "object") {
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
