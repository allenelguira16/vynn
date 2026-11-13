import {
  getAsyncBoundary,
  getAsyncIDIfAvailable,
  getAsyncValue,
  getAsyncValues,
} from "../context/async-context";
import { getErrorBoundary, type ErrorBoundary } from "../context/error-boundary-context";
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
      boundaryHandled: boolean;
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
  let errorBoundary: ErrorBoundary | undefined = getErrorBoundary();

  function handleError(
    error: unknown,
    currentVersion: number,
    previous: T | undefined,
    hasPrevious: boolean,
  ): void {
    if (currentVersion !== version || owner?.disposed) return;

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

    let boundaryHandled = false;

    // Dispatch before publishing the rejected record. A client ErrorBoundary
    // can dispose the resource's view owner while switching to its fallback.
    if (error instanceof Error) {
      const boundary = (errorBoundary ??= getErrorBoundary());

      if (boundary) {
        boundary(error);
        boundaryHandled = true;
      }
    }

    record.value = {
      status: "rejected",
      error,
      version: currentVersion,
      previous,
      hasPrevious,
      boundaryHandled,
    };
  }

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
              runWithOwner(owner, () => {
                handleError(error, currentVersion, previous, hasPrevious);
              });
            },
          );
        } catch (error) {
          handleError(error, currentVersion, previous, hasPrevious);
        }
      },
      { phase: "render", owner },
    );
  }

  const resource = markRef({
    get value(): T {
      // Capture a boundary from the consuming owner for resources created
      // outside a component, such as module-level resources started on read.
      errorBoundary ??= getErrorBoundary();

      if (!started) start();

      const current = record.value;

      if (!current) {
        throw new Error("[vynn]: The async resource did not start.");
      }

      if (current.status === "pending") {
        if (retainPrevious && current.hasPrevious) return current.previous as T;

        const boundary = getAsyncBoundary();

        // Lazy components already defer their own server-rendered range.
        // Registering their module promise with an outer Await would emit its
        // fallback before the lazy subtree can finish rendering (and discover redirects).
        if (!isServer() || !lazyGetter) {
          boundary?.(current.promise);
        }

        throw new NotReadyError(current.promise, boundary);
      }

      if (current.status === "rejected") {
        // A resource may have started before it was consumed by an
        // ErrorBoundary. Give the consuming boundary one chance to handle it.
        if (!current.boundaryHandled && current.error instanceof Error) {
          const boundary = errorBoundary ?? getErrorBoundary();

          if (boundary) {
            errorBoundary = boundary;
            boundary(current.error);
            record.value = { ...current, boundaryHandled: true };

            return retainPrevious && current.hasPrevious
              ? current.previous as T
              : undefined as T;
          }
        }

        if (current.boundaryHandled) {
          return retainPrevious && current.hasPrevious
            ? current.previous as T
            : undefined as T;
        }

        throw current.error;
      }

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
