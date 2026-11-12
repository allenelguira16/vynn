const NativePromise = globalThis.Promise;

const noop = () => {};

const NEVER_PROMISE: Promise<never> = {
  then: () => NEVER_PROMISE,
  catch: () => NEVER_PROMISE,
  finally: () => NEVER_PROMISE,
  [Symbol.toStringTag]: "Promise",
} as unknown as Promise<never>;

type FakePromiseExecutor = (
  resolve: (value?: unknown) => void,
  reject: (reason?: unknown) => void,
) => void;

const FakePromise = Object.assign(
  function FakePromise(executor?: FakePromiseExecutor) {
    if (executor) {
      try {
        executor(noop, noop);
      } catch {
        // This pass exists only to collect synchronous reactive reads.
      }
    }

    return NEVER_PROMISE;
  },
  {
    resolve: (..._values: unknown[]) => NEVER_PROMISE,
    reject: (..._values: unknown[]) => NEVER_PROMISE,
    all: (..._values: unknown[]) => NEVER_PROMISE,
    allSettled: (..._values: unknown[]) => NEVER_PROMISE,
    race: (..._values: unknown[]) => NEVER_PROMISE,
    any: (..._values: unknown[]) => NEVER_PROMISE,
    withResolvers: () => ({
      promise: NEVER_PROMISE,
      resolve: noop,
      reject: noop,
    }),
  },
) as unknown as PromiseConstructor;

function restoreGlobal(
  key: "Promise" | "fetch",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, key);
  }
}

/**
 * Runs an async getter once with inert async APIs to collect its synchronous
 * reactive dependencies without repeating network requests during hydration.
 */
export function withFakeAsyncApis<T>(callback: () => T): T {
  const promiseDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Promise");
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const originalFetch = globalThis.fetch;

  try {
    Object.defineProperty(globalThis, "Promise", {
      configurable: true,
      enumerable: promiseDescriptor?.enumerable ?? false,
      writable: true,
      value: FakePromise,
    });

    if (typeof originalFetch === "function") {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        enumerable: fetchDescriptor?.enumerable ?? false,
        writable: true,
        value: (..._args: Parameters<typeof fetch>) => NEVER_PROMISE as Promise<Response>,
      });
    }

    const result = callback();

    if (
      result !== null &&
      (typeof result === "object" || typeof result === "function") &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      NativePromise.resolve(result as unknown as PromiseLike<unknown>).catch(noop);
    }

    return result;
  } finally {
    restoreGlobal("fetch", fetchDescriptor);
    restoreGlobal("Promise", promiseDescriptor);
  }
}
