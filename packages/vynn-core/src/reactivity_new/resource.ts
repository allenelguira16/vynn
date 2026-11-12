import {
  getAsyncBoundary,
  getAsyncIDIfAvailable,
  getAsyncValue,
  getAsyncValues,
} from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "./not-ready-error";
import { withFakeAsyncApis } from "./fake-async";
import { createReactiveEffect, untrack } from "./effect";
import { createCell, markRef, type VynnRef } from "./ref";
import { isPromiseLike } from "./utils";
import { isPending, registerPending } from "./pending";

export { isPending };

type ResourceRecord<T> =
  | {
      status: "pending";
      promise: Promise<unknown>;
      version: number;
      previous: T | undefined;
      hasPrevious: boolean;
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
      previous: T | undefined;
      hasPrevious: boolean;
    };

export type Async<T> = VynnRef<T>;

export type ResourceOptions = {
  lazy?: boolean;
  retainPrevious?: boolean;
};

export function createAsyncResource<T>(
  getter: () => Promise<T>,
  options: ResourceOptions = {},
): VynnRef<T> {
  const { lazy = false, retainPrevious = true } = options;
  const owner = getOwner();
  const record = createCell<ResourceRecord<T> | undefined>(undefined);

  let version = 0;
  let started = false;
  const lazyGetter = isAsyncGetterFromLazy(getter);

  let asyncID: string | undefined = lazyGetter || lazy ? undefined : getAsyncIDIfAvailable();
  let asyncValues = getAsyncValues();
  let hasReadHydrationValue = false;
  let hydrationValue: { found: boolean; value: T | undefined } | undefined;

  function start(): void {
    if (started) return;
    started = true;

    if (!lazyGetter && !lazy && asyncID === undefined) {
      asyncID = getAsyncIDIfAvailable();
    }

    if (!asyncValues) asyncValues = getAsyncValues();

    createReactiveEffect(
      () => {
        const currentVersion = ++version;
        const previousRecord = untrack(() => record.value);
        let previous: T | undefined;
        let hasPrevious = false;

        if (previousRecord?.status === "resolved") {
          previous = previousRecord.value;
          hasPrevious = true;
        } else if (previousRecord?.status === "pending" || previousRecord?.status === "rejected") {
          previous = previousRecord.previous;
          hasPrevious = previousRecord.hasPrevious;
        }

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
            previous,
            hasPrevious,
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
                    previous,
                    hasPrevious,
                  };
                  return;
                }

                record.value = {
                  status: "rejected",
                  error,
                  version: currentVersion,
                  previous,
                  hasPrevious,
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
              previous,
              hasPrevious,
            };
            return;
          }

          record.value = {
            status: "rejected",
            error,
            version: currentVersion,
            previous,
            hasPrevious,
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
        if (retainPrevious && current.hasPrevious) return current.previous as T;

        const boundary = getAsyncBoundary();
        boundary?.(current.promise);
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
    // Keep lazy resources lazy; ordinary resources suspend through Await and
    // are checked again after their promise settles.
    if (isServer() && !lazy) {
      void resource.value;
    }

    return record.value?.status === "pending";
  });

  // Ownerless module resources are activated by their first read so they can
  // acquire the request-local hydration scope of the render that consumes them.
  if (!lazy && (owner !== null || asyncID !== undefined)) start();

  return resource;
}
