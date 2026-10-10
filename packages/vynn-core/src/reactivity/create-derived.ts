import { $state } from "./$state";
import { $effect } from "./$effect";
import { Computed } from "./$computed";
import { Async } from "./$async";
import { transaction } from "./transaction";
import { isPromiseLike, MaybePromise, UnwrapPromise } from "./is-promise-like";
import { getAsyncBoundary, NotReadyError } from "../components/boundary";

const context = new WeakMap<object, { value: unknown }>();

/**
 * Checks whether a derived value is currently pending on a promise.
 *
 * @param value The derived value to check.
 * @returns `true` when the value is backed by a pending promise.
 */
export const isPending = (value: object): boolean => {
  return isPromiseLike(context.get(value)?.value);
};

/**
 * Creates a reactive derived value from a getter.
 *
 * The getter is evaluated reactively and its result is stored in a state
 * container. Both synchronous values and promise-like values are supported.
 * Promise results are ignored when they no longer belong to the current
 * derived computation.
 *
 * When `writable` is enabled, the returned value also exposes a setter that
 * replaces the current derived value.
 *
 * @template T The type returned by the getter.
 * @param getter A function that computes the derived value.
 * @param writable Whether the resulting value can be assigned directly.
 * @returns A computed or async derived value, depending on `writable`.
 */
export function createDerived<T>(
  getter: () => T,
  writable: boolean,
): Computed<T> | Async<T> {
  type Value = UnwrapPromise<T>;

  const result = $state<MaybePromise<Value> | undefined>();
  let currentPromise: PromiseLike<Value> | undefined;
  let initialized = false;

  const setValue = (value: MaybePromise<Value>) => {
    transaction(() => {
      initialized = true;
      result.value = value;
    });
  };

  const setPromise = (promise: PromiseLike<Value>) => {
    currentPromise = promise;
    setValue(promise);
    promise.then(
      (value) => {
        if (currentPromise !== promise) return;
        transaction(() => {
          if (currentPromise === promise) {
            result.value = value;
          }
        });
      },
      (error) => {
        if (currentPromise !== promise) return;
        transaction(() => {
          if (currentPromise !== promise) return;
          currentPromise = undefined;
          result.value = error;
        });
      },
    );
  };

  const update = (value: T | PromiseLike<Value>) => {
    if (isPromiseLike<Value>(value)) {
      setPromise(value);
      return;
    }
    currentPromise = undefined;
    setValue(value as Value);
  };

  $effect(() => {
    try {
      update(getter());
    } catch (error) {
      if (!isPromiseLike<Value>(error)) {
        throw error;
      }
      setPromise(error);
    }
  });

  const derived = {} as Computed<T> | Async<T>;

  Object.defineProperty(derived, "value", {
    enumerable: true,
    configurable: true,
    get(): Value {
      const value = result.value;
      if (!initialized) {
        throw new Error("Computed value was read before initialization");
      }
      if (isPromiseLike<Value>(value)) {
        const boundary = getAsyncBoundary();

        boundary?.(value as Promise<any>);
        throw new NotReadyError(derived);
        // throw value;
      }
      return value as Value;
    },
    ...(writable && {
      set(value: Value) {
        currentPromise = undefined;
        setValue(value);
      },
    }),
  });

  context.set(derived, result);
  return derived;
}
