import { track, trigger } from "./track";

export type Store<T extends object> = T;

const proxyMap = new WeakMap<object, unknown>();

export function $store<T extends object>(initialObject: T): Store<T> {
  function createReactiveObject(obj: T): T {
    if (proxyMap.has(obj)) return proxyMap.get(obj) as T;

    const proxy = new Proxy(obj, {
      get(target, key, receiver) {
        // track every property access
        track(target, key);

        const result = Reflect.get(target, key, receiver);

        // Auto-bind methods to the Proxy itself to avoid 'this' becoming DOM or global
        if (typeof result === "function") {
          return result.bind(receiver);
        }

        // Handle getters (derived properties)
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor?.get) {
          return descriptor.get.call(receiver);
        }

        // Deep reactivity
        if (typeof result === "object" && result !== null) {
          return createReactiveObject(result as T);
        }

        return result;
      },

      set(target, key, value, receiver) {
        const oldValue = target[key as keyof T];
        const result = Reflect.set(target, key, value, receiver);

        if (oldValue !== value) {
          trigger(target, key);
        }

        return result;
      },
    });

    proxyMap.set(obj, proxy);
    return proxy;
  }

  return createReactiveObject(initialObject);
}
