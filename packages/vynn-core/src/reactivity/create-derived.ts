import { $state } from "./$state";
import { $effect } from "./$effect";
import { Computed } from "./$computed";
import { Async } from "./$async";
import { transaction } from "./transaction";
import { isPromiseLike, MaybePromise, UnwrapPromise } from "./is-promise-like";

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

  $effect(() => {
    try {
      const value = getter();

      if (isPromiseLike<Value>(value)) {
        const promise = value;

        transaction(() => {
          currentPromise = promise;
          initialized = true;
          result.value = promise;
        });

        promise.then(
          (resolved) => {
            if (currentPromise !== promise) {
              return;
            }

            transaction(() => {
              // Re-check inside the transaction as well.
              if (currentPromise !== promise) {
                return;
              }

              result.value = resolved;
            });
          },
          (error) => {
            if (currentPromise !== promise) {
              return;
            }

            transaction(() => {
              if (currentPromise !== promise) {
                return;
              }

              currentPromise = undefined;
              result.value = error;
            });
          },
        );

        return;
      }

      transaction(() => {
        currentPromise = undefined;
        initialized = true;
        result.value = value as Value;
      });
    } catch (error) {
      if (isPromiseLike<Value>(error)) {
        transaction(() => {
          currentPromise = error;
          initialized = true;
          result.value = error;
        });

        return;
      }

      throw error;
    }
  });

  const value = {};

  Object.defineProperty(value, "value", {
    enumerable: true,
    configurable: true,

    get(): Value {
      const currentValue = result.value;

      if (!initialized) {
        throw new Error("Computed value was read before initialization");
      }

      if (isPromiseLike<Value>(currentValue)) {
        throw currentValue;
      }

      return currentValue as Value;
    },

    ...(writable
      ? {
          set(newValue: Value) {
            transaction(() => {
              currentPromise = undefined;
              initialized = true;
              result.value = newValue;
            });
          },
        }
      : {}),
  });

  context.set(value, result);

  return value as Computed<T> | Async<T>;
}
