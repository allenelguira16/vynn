import { track, trigger } from "./track";
import { getCurrentTransaction, transaction } from "./transaction";

export type Store<T extends object> = T;

const proxyMap = new WeakMap<object, unknown>();

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
 * @template T The type of the object being made reactive.
 * @param initialObject The object to make reactive.
 * @returns A deeply reactive proxy of the initial object.
 */
export function $store<T extends object>(initialObject: T): Store<T> {
  function createReactiveObject<U extends object>(obj: U): U {
    if (proxyMap.has(obj)) {
      return proxyMap.get(obj) as U;
    }

    const proxy = new Proxy(obj, {
      get(target, key, receiver) {
        track(target, key);

        const result = Reflect.get(target, key, receiver);

        // Preserve `this` as the reactive proxy.
        if (typeof result === "function") {
          return result.bind(receiver);
        }

        // Handle accessors with the reactive proxy as `this`.
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);

        if (descriptor?.get) {
          return descriptor.get.call(receiver);
        }

        // Deep reactivity.
        if (typeof result === "object" && result !== null) {
          return createReactiveObject(result as object);
        }

        return result;
      },

      set(target, key, value, receiver) {
        const oldValue = target[key as keyof U];

        const write = () => {
          const result = Reflect.set(target, key, value, receiver);

          if (oldValue !== value) {
            trigger(target, key);
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
    });

    proxyMap.set(obj, proxy);

    return proxy as U;
  }

  return createReactiveObject(initialObject);
}
