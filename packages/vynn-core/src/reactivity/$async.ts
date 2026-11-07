import {
  getAsyncBoundary,
  getAsyncIDIfAvailable,
  getAsyncValue,
  getAsyncValues,
} from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { withFakeAsyncApis } from "./$async.util";
import { $renderEffect } from "./$effect";
import { createCell } from "./cell";
import { NotReadyError } from "./not-ready-error";
import { registerPending } from "./pending";
import { transaction } from "./transaction";
import { untrack } from "./untrack";

export type Async<T> = {
  value: T;
};

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
 * Creates a lazy asynchronous resource. Pending reads always suspend, even
 * when the resource has resolved previously.
 *
 * Resources can be created without an active Vynn owner. Ownerless resources
 * are not automatically disposed. If first read occurs inside a render, they
 * acquire that render's async hydration scope; otherwise they work without SSR
 * serialization or hydration restoration.
 */
export function $async<T>(getter: () => Promise<T>): Async<T> {
  return createAsyncResource(getter, false);
}

/**
 * Creates writable async-derived state.
 *
 * Unlike $async, this retains the last resolved value while a replacement
 * computation is pending. It starts the first computation immediately.
 */
export function createAsyncDerived<T>(getter: () => Promise<T>): Async<T> {
  const derived = createAsyncResource(getter, true);

  // Async-derived state is eager, like an ordinary derived computation.
  // The initial read starts the owned computation; NotReadyError is expected
  // until the first Promise settles.
  try {
    untrack(() => derived.value);
  } catch (error) {
    if (!(error instanceof NotReadyError)) {
      throw error;
    }
  }

  return derived;
}

export function createAsyncResource<T>(
  getter: () => Promise<T>,
  retainPrevious: boolean,
): Async<T> {
  const isLazy = isAsyncGetterFromLazy(getter);
  // Reserve the hydration ID at creation time when a render context exists.
  // Module-level resources acquire it when first read inside a render instead.
  let asyncID = isLazy ? undefined : getAsyncIDIfAvailable();
  let asyncValues = getAsyncValues();
  const owner = getOwner();
  const result = createCell<AsyncRecord<T> | undefined>(undefined);

  let version = 0;
  let isInitialized = false;

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
          const hydrationData =
            isLazy || asyncID === undefined ? undefined : getAsyncValue<T>(asyncID);

          const previousRecord = untrack(() => result.value);
          const previous =
            previousRecord?.status === "resolved"
              ? previousRecord.value
              : (previousRecord?.status === "pending" || previousRecord?.status === "rejected") &&
                  previousRecord.hasPrevious
                ? previousRecord.previous
                : undefined;
          const hasPrevious =
            previousRecord?.status === "resolved" ||
            ((previousRecord?.status === "pending" || previousRecord?.status === "rejected") &&
              previousRecord.hasPrevious);

          let promise: Promise<T> | undefined;

          try {
            if (hydrationData?.found) {
              // Execute the getter with inert async APIs to establish the same
              // reactive dependencies without repeating the server request.
              withFakeAsyncApis(getter);
            } else {
              promise = Promise.resolve(getter());
            }
          } catch (error) {
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
            result.value = {
              status: "resolved",
              value: hydrationData.value as T,
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

  const derived: Async<T> = {
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

  registerPending(derived, () => {
    // oxlint-disable
    if (isServer()) derived.value; // On SSR, make this be handled by renderSSRChildren and defer it.

    return result.value?.status === "pending";
  });

  return derived;
}

export { isPending } from "./pending";
