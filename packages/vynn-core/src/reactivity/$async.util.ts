/**
 * Keep the real Promise constructor before installing any temporary fakes.
 */
const NativePromise = globalThis.Promise;

const noop = () => {};

/**
 * A thenable that never settles.
 *
 * Awaiting it never resumes, and registering callbacks never invokes them.
 */
const NEVER_PROMISE: any = {};

NEVER_PROMISE.then = () => NEVER_PROMISE;
NEVER_PROMISE.catch = () => NEVER_PROMISE;
NEVER_PROMISE.finally = () => NEVER_PROMISE;

Object.defineProperty(NEVER_PROMISE, Symbol.toStringTag, {
  value: "Promise",
});

type FakePromiseExecutor = (
  resolve: (value?: any) => void,
  reject: (reason?: unknown) => void,
) => void;

/**
 * Temporary Promise replacement used only during hydration tracking.
 *
 * The executor runs synchronously so reactive reads inside it can still
 * be tracked. Its resolve/reject callbacks deliberately do nothing.
 */
const FakePromise = Object.assign(
  function FakePromise(executor?: FakePromiseExecutor) {
    if (executor) {
      try {
        executor(noop, noop);
      } catch {
        // Rejections during the tracking pass must never settle.
      }
    }

    return NEVER_PROMISE;
  },
  {
    resolve: (..._args: any[]) => NEVER_PROMISE,
    reject: (..._args: any[]) => NEVER_PROMISE,
    all: (..._args: any[]) => NEVER_PROMISE,
    allSettled: (..._args: any[]) => NEVER_PROMISE,
    race: (..._args: any[]) => NEVER_PROMISE,
    any: (..._args: any[]) => NEVER_PROMISE,

    withResolvers: () => ({
      promise: NEVER_PROMISE,
      resolve: noop,
      reject: noop,
    }),
  },
) as unknown as PromiseConstructor;

/**
 * Restores a global property to its original descriptor.
 */
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
 * Executes a synchronous reactive tracking pass without allowing
 * ordinary Promise chains or fetch requests to complete.
 *
 * All global replacements are restored, even if the callback throws.
 */
export function withFakeAsyncApis<T>(callback: () => T): T {
  const promiseDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "Promise",
  );

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
        value: (..._args: Parameters<typeof fetch>) =>
          NEVER_PROMISE as Promise<Response>,
      });
    }

    const result = callback();

    // Consume any rejection from an async function whose result is
    // deliberately discarded during this tracking-only pass.
    if (
      result !== null &&
      (typeof result === "object" || typeof result === "function") &&
      typeof (result as any).then === "function"
    ) {
      NativePromise.resolve(result as any).catch(noop);
    }

    return result;
  } finally {
    restoreGlobal("fetch", fetchDescriptor);
    restoreGlobal("Promise", promiseDescriptor);
  }
}
