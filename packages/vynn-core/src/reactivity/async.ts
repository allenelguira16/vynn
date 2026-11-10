import {
  getAsyncBoundary,
  getAsyncIDIfAvailable,
  getAsyncValue,
  getAsyncValues,
} from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $renderEffect } from "./$effect";
import { createCell } from "./cell";
import { NotReadyError } from "./not-ready-error";
import { registerPending } from "./pending";
import { markRef, type VynnRef } from "./ref";
import { transaction } from "./transaction";
import { untrack } from "./untrack";
import { withFakeAsyncApis } from "./with-fake-async-apis";

export type Async<T> = VynnRef<T>;

type AsyncRecord<T> =
  | {
      status: "pending";
      promise: Promise<T>;
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

/**
 * Creates writable async-derived state.
 *
 * Unlike $async, this retains the last resolved value while a replacement
 * computation is pending. It starts the first computation immediately.
 */
export function createAsyncDerived<T>(getter: () => Promise<T>, lazy?: boolean): Async<T>;
export function createAsyncDerived<T>(getter: () => T, lazy?: boolean): Async<T>;
export function createAsyncDerived<T>(getter: () => T | Promise<T>, lazy?: boolean): Async<T>;
export function createAsyncDerived<T>(getter: () => T | Promise<T>, lazy = false): Async<T> {
  const derived = createAsyncResource<T>(getter, true, { lazy });

  // Async-derived state is eager by default. Lazy computations defer resource
  // initialization until their first value read.
  if (!lazy) {
    try {
      untrack(() => derived.value);
    } catch (error) {
      if (!(error instanceof NotReadyError)) {
        throw error;
      }
    }
  }

  return derived;
}

type AsyncResourceOptions = {
  lazy?: boolean;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function createAsyncResource<T>(
  getter: () => T | Promise<T>,
  retainPrevious: boolean,
  options: AsyncResourceOptions = {},
): Async<T> {
  const { lazy = false } = options;
  const isLazy = isAsyncGetterFromLazy(getter);
  // Reserve the hydration ID at creation time when a render context exists.
  // Module-level resources acquire it when first read inside a render instead.
  let asyncID = isLazy || lazy ? undefined : getAsyncIDIfAvailable();
  let asyncValues = getAsyncValues();
  const owner = getOwner();
  const result = createCell<AsyncRecord<T> | undefined>(undefined);

  let version = 0;
  let isInitialized = false;
  let hydrationData: { found: boolean; value: T | undefined } | undefined;
  let hasReadHydrationData = false;

  const initialize = () => {
    if (isInitialized) return;

    isInitialized = true;

    // A resource created outside a component can still be first consumed
    // inside a render. Acquire that render's hydration scope at first use.
    if (!isLazy && asyncID === undefined) {
      asyncID = getAsyncIDIfAvailable();
    }

    if (!asyncValues) {
      asyncValues = getAsyncValues();
    }

    // Bind the resource effect to the creation owner, not the owner that
    // happened to perform the first read. An ownerless module-level resource
    // intentionally remains alive for the lifetime of its module.
    runWithOwner(owner, () => {
      $renderEffect(() => {
        transaction(() => {
          const currentVersion = ++version;

          // Read the server snapshot only once. If a dependency suspends while
          // hydration tracking runs, keep the snapshot for the retry instead
          // of consuming the ID and accidentally starting a duplicate request.
          if (!isLazy && asyncID !== undefined && !hasReadHydrationData) {
            hydrationData = getAsyncValue<T>(asyncID);
            hasReadHydrationData = true;
          }

          const previousRecord = untrack(() => result.value);
          let previous: T | undefined;
          let hasPrevious = false;

          switch (previousRecord?.status) {
            case "resolved":
              previous = previousRecord.value;
              hasPrevious = true;
              break;

            case "pending":
            case "rejected":
              previous = previousRecord.previous;
              hasPrevious = previousRecord.hasPrevious;
              break;

            default:
              previous = undefined;
              break;
          }

          let promise: Promise<T> | undefined;
          let synchronousValue: T | undefined;
          let hasSynchronousValue = false;

          try {
            if (hydrationData?.found) {
              // Execute the getter with inert async APIs to establish the same
              // reactive dependencies without repeating the server request.
              withFakeAsyncApis(getter);
            } else {
              const nextValue = getter();

              if (isPromiseLike(nextValue)) {
                promise = Promise.resolve(nextValue as PromiseLike<T>);
                if (isLazy && !isServer()) registerPromiseFromLazy(promise);
              } else {
                synchronousValue = nextValue as T;
                hasSynchronousValue = true;
              }
            }
          } catch (error) {
            // A getter may depend on another async resource. Keep its pending
            // promise as the current state and let the tracked dependency
            // trigger this computation again when it settles.
            if (error instanceof NotReadyError) {
              result.value = {
                status: "pending",
                promise: error.promise,
                version: currentVersion,
                previous,
                hasPrevious,
              };
              return;
            }

            hydrationData = undefined;
            result.value = {
              status: "rejected",
              error,
              version: currentVersion,
              previous,
              hasPrevious,
            };
            return;
          }

          if (hydrationData?.found) {
            const value = hydrationData.value as T;
            hydrationData = undefined;

            result.value = {
              status: "resolved",
              value,
              version: currentVersion,
            };
            return;
          }

          if (hasSynchronousValue) {
            result.value = {
              status: "resolved",
              value: synchronousValue as T,
              version: currentVersion,
            };
            return;
          }

          const pendingPromise = promise!;

          result.value = {
            status: "pending",
            promise: pendingPromise,
            version: currentVersion,
            previous,
            hasPrevious,
          };

          // Attach exactly one settlement handler for this operation.
          pendingPromise.then(
            (value) => {
              if (currentVersion !== version) return;
              if (asyncValues && asyncID !== undefined) {
                asyncValues[asyncID] = value;
              }

              result.value = {
                status: "resolved",
                value,
                version: currentVersion,
              };
            },
            (error: unknown) => {
              if (currentVersion !== version) return;

              // An async getter converts a synchronous NotReadyError from a
              // nested resource into a rejected Promise. Preserve the pending
              // dependency so its tracked update can retry this computation.
              if (error instanceof NotReadyError) {
                result.value = {
                  status: "pending",
                  promise: error.promise,
                  version: currentVersion,
                  previous,
                  hasPrevious,
                };
                return;
              }

              result.value = {
                status: "rejected",
                error,
                version: currentVersion,
                previous,
                hasPrevious,
              };
            },
          );
        });
      });
    });
  };

  const derived = markRef({
    get value(): T {
      // Check for a preassigned value without tracking the initial
      // undefined state. Initialize before the tracked read so the pending
      // write does not schedule a redundant second consumer execution.
      if (!isInitialized && !untrack(() => result.value)) initialize();

      const record = result.value;

      if (!record) {
        throw new Error("$async failed to initialize its operation.");
      }

      if (record.status === "pending") {
        if (retainPrevious && record.hasPrevious) {
          return record.previous as T;
        }

        const boundary = getAsyncBoundary();

        if (boundary) boundary(record.promise);
        throw new NotReadyError(record.promise, boundary);
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
  });

  registerPending(derived, () => {
    // Preserve SSR read-to-suspend behavior for ownerless resources that are
    // activated by their first consumer rather than at creation time.
    // oxlint-disable-next-line no-unused-expressions
    if (isServer() && !lazy) derived.value;

    return result.value?.status === "pending";
  });

  // A module-level resource has no request context yet. Keep its first read as
  // the activation point so SSR can attach the correct request-local ID/data.
  if (!lazy && (owner !== null || asyncID !== undefined)) {
    initialize();
  }

  return derived as Async<T>;
}

export { isPending } from "./pending";
