import {
  getAsyncBoundary,
  getAsyncIDIfAvailable,
  getAsyncValue,
  getAsyncValues,
} from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { createReactiveEffect } from "./effect";
import { withFakeAsyncApis } from "./fake-async";
import { NotReadyError } from "./not-ready-error";
import { isPending, registerPending } from "./pending";
import { createCell, markRef, type VynnRef } from "./ref";
import { isPromiseLike } from "./utils";

export { isPending };

type ResourceRecord<T> =
  | {
      status: "pending";
      promise: Promise<unknown>;
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

export type Async<T> = VynnRef<T>;

export function createAsyncResource<T>(getter: () => Promise<T>): VynnRef<T> {
  const owner = getOwner();
  const record = createCell<ResourceRecord<T> | undefined>(undefined);

  let version = 0;
  let started = false;
  const lazyGetter = isAsyncGetterFromLazy(getter);

  let asyncID: string | undefined = lazyGetter ? undefined : getAsyncIDIfAvailable();
  let asyncValues = getAsyncValues();
  let hasReadHydrationValue = false;
  let hydrationValue: { found: boolean; value: T | undefined } | undefined;

  function start(): void {
    if (started) return;
    started = true;

    if (!lazyGetter && asyncID === undefined) {
      asyncID = getAsyncIDIfAvailable();
    }

    if (!asyncValues) asyncValues = getAsyncValues();

    createReactiveEffect(
      () => {
        const currentVersion = ++version;
        try {
          if (!lazyGetter && asyncID !== undefined && !hasReadHydrationValue) {
            hydrationValue = getAsyncValue<T>(asyncID);
            hasReadHydrationValue = true;
          }

          if (hydrationValue?.found) {
            withFakeAsyncApis(getter);
            const value = hydrationValue.value as T;
            hydrationValue = undefined;
            record.value = { status: "resolved", value, version: currentVersion };
            return;
          }

          const result = getter();

          if (!isPromiseLike<T>(result)) {
            record.value = {
              status: "resolved",
              value: result as T,
              version: currentVersion,
            };
            return;
          }

          const promise = Promise.resolve(result);

          if (lazyGetter) registerPromiseFromLazy(promise);

          record.value = {
            status: "pending",
            promise,
            version: currentVersion,
          };

          promise.then(
            (value) => {
              if (currentVersion !== version) return;

              runWithOwner(owner, () => {
                if (asyncValues && asyncID !== undefined) asyncValues[asyncID] = value;
                record.value = { status: "resolved", value, version: currentVersion };
              });
            },
            (error: unknown) => {
              if (currentVersion !== version) return;

              runWithOwner(owner, () => {
                if (error instanceof NotReadyError) {
                  record.value = {
                    status: "pending",
                    promise: error.promise,
                    version: currentVersion,
                  };
                  return;
                }

                record.value = {
                  status: "rejected",
                  error,
                  version: currentVersion,
                };
              });
            },
          );
        } catch (error) {
          if (error instanceof NotReadyError) {
            record.value = {
              status: "pending",
              promise: error.promise,
              version: currentVersion,
            };
            return;
          }

          record.value = {
            status: "rejected",
            error,
            version: currentVersion,
          };
        }
      },
      { phase: "render", owner },
    );
  }

  const resource = markRef({
    get value(): T {
      if (!started) start();

      const current = record.value;

      if (!current) {
        throw new Error("[vynn]: The async resource did not start.");
      }

      if (current.status === "pending") {
        const boundary = getAsyncBoundary();

        // Lazy components already defer their own server-rendered range.
        // Registering their module promise with an outer Await would emit its
        // fallback before the lazy subtree can finish rendering (and discover redirects).
        if (!isServer() || !lazyGetter) {
          boundary?.(current.promise);
        }

        throw new NotReadyError(current.promise, boundary);
      }

      if (current.status === "rejected") throw current.error;

      return current.value;
    },

    set value(nextValue: T) {
      version++;
      record.value = {
        status: "resolved",
        value: nextValue,
        version,
      };
    },
  }) as VynnRef<T>;

  registerPending(resource, () => {
    // During SSR, reading isPending() must participate in the same async
    // boundary as reading resource.value. Otherwise the server can serialize
    // a permanently pending UI state without waiting for the first result.
    if (isServer()) {
      void resource.value;
    }

    return record.value?.status === "pending";
  });

  // Ownerless module resources are activated by their first read so they can
  // acquire the request-local hydration scope of the render that consumes them.
  if (owner !== null || asyncID !== undefined) start();

  return resource;
}
