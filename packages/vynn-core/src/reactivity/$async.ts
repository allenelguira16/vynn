import {
  getAsyncBoundary,
  getAsyncID,
  getAsyncValue,
  getAsyncValues,
} from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isAsyncGetterFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { withFakeAsyncApis } from "./$async.util";
import { $renderEffect } from "./$effect";
import { $state } from "./$state";
import { NotReadyError } from "./not-ready-error";
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
  return context.get(value)?.() ?? false;
}

/**
 * Creates a lazy asynchronous resource.
 *
 * The getter runs on the first value read. Subsequent reads share the active
 * request or return its settled result until a reactive dependency changes.
 */
export function $async<T>(getter: () => Promise<T>): Async<T> {
  const isLazy = isAsyncGetterFromLazy(getter);
  // Reserve the hydration ID at creation time so declaration order remains stable.
  const asyncID = isLazy ? undefined : getAsyncID();
  const owner = getOwner();
  const result = $state<AsyncRecord<T> | undefined>();

  let version = 0;
  let isInitialized = false;

  const initialize = () => {
    if (isInitialized) return;

    isInitialized = true;

    // Bind the resource effect to the creation owner, not the owner that
    // happened to perform the first read.
    runWithOwner(owner, () => {
      $renderEffect(() => {
        transaction(() => {
          const currentVersion = ++version;
          const asyncValues = getAsyncValues();
          const hydrationData =
            isLazy || asyncID === undefined ? undefined : getAsyncValue<T>(asyncID);

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
    // oxlint-disable
    if (isServer()) derived.value; // On SSR, make this be handled by renderSSRChildren and defer it.

    return result.value?.status === "pending";
  });

  return derived;
}
