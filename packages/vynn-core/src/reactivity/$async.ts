import { getAsyncBoundary } from "../components/boundary";
import { $state } from "./$state";
import { $renderEffect } from "./$effect";
import { NotReadyError } from "./not-ready-error";
import { getOwnerContext, modifyOwnerContext } from "../life-cycle/owner";
import { getRenderMode } from "../context/render-mode";
import { transaction } from "./transaction";
import { isInsideLazy } from "../components/lazy";

export type Async<T> = {
  value: T;
};

type AsyncRecord<T> =
  | {
      status: "pending";
      promise: Promise<T>;
      version: number;
    }
  | {
      status: "resolved";
      value: T;
      version: number;
    }
  | {
      status: "rejected";
      error: unknown;
      version: number;
    };

const context = new WeakMap<object, () => boolean>();

export function isPending(value: object): boolean {
  // assertInsideAwait();

  return context.get(value)?.() ?? false;
}

function getServerRenderedData() {
  let asyncID = getOwnerContext<number>("$async-id");
  modifyOwnerContext<number>("$async-id", (current) => current + 1);

  // console.log(!getRenderMode() && !!asyncID);
  // console.log(asyncID, (window as any).__vynnAsyncData);
  if (!getRenderMode() && asyncID != null) {
    return (window as any).__vynnAsyncData[asyncID];
  }

  return undefined;
}

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
function withFakeAsyncApis<T>(callback: () => T): T {
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

export function $async<T>(getter: () => Promise<T>): Async<T> {
  const result = $state<AsyncRecord<T> | undefined>();
  let version = 0;

  $renderEffect(() => {
    transaction(() => {
      const currentVersion = ++version;

      const ssrData = getServerRenderedData();

      let promise!: Promise<T>;

      try {
        if (ssrData) {
          withFakeAsyncApis(() => {
            getter();
          });
        } else {
          promise = Promise.resolve(getter());
        }
      } catch (error) {
        result.value = {
          status: "rejected",
          error,
          version: currentVersion,
        };
        return;
      }

      if (ssrData) {
        result.value = {
          status: "resolved",
          value: ssrData,
          version: currentVersion,
        };
      } else {
        result.value = {
          status: "pending",
          promise,
          version: currentVersion,
        };

        const $asyncValues = getOwnerContext<any[]>("$async-values");
        const isLazy = isInsideLazy();
        // Attach exactly one settlement handler for this operation.
        promise.then(
          (value) => {
            if (currentVersion !== version) return;
            if ($asyncValues && !isLazy) $asyncValues.push(value);

            result.value = {
              status: "resolved",
              value,
              version: currentVersion,
            };
          },
          (error: unknown) => {
            if (currentVersion !== version) return;

            result.value = {
              status: "rejected",
              error,
              version: currentVersion,
            };
          },
        );
      }
    });
  });

  const derived: Async<T> = {
    get value(): T {
      // assertInsideAwait();

      const record = result.value;

      if (!record) {
        throw new Error(
          "$async was read before its operation was initialized.",
        );
      }

      if (record.status === "pending") {
        const boundary = getAsyncBoundary();

        if (boundary) boundary(record.promise);
        throw new NotReadyError(record.promise);
      }

      if (record.status === "rejected") {
        throw record.error;
      }

      return record.value;
    },

    set value(value: T) {
      // Manual assignment invalidates any older outstanding request.
      const currentVersion = ++version;

      result.value = {
        status: "resolved",
        value,
        version: currentVersion,
      };
    },
  };

  context.set(derived, () => {
    if (getRenderMode()) derived.value; // On SSR, make this be handle by renderSSRChildren and defer it

    return result.value?.status === "pending";
  });

  return derived;
}
