import {
  getAsyncBoundary,
  getAsyncValue,
  getAsyncValues,
  hasAsyncHydrationOwnerIDReservation,
  hasAsyncHydrationValue,
  registerAsyncOwnerIDReservation,
} from "../context/async-context";

import { isAsyncGetterFromLazy, registerPromiseFromLazy } from "../context/lazy-context";
import {
  createOwner,
  createOwnerID,
  createOwnerIdentityTransaction,
  commitOwnerIdentityTransaction,
  disposeOwner,
  getOwner,
  getOwnerIdentityID,
  hasOwnerIdentityTransaction,
  peekOwnerID,
  rollbackOwnerIdentityTransaction,
  runWithOwner,
  type Owner,
} from "../life-cycle/owner";
import { createReactiveEffect, stopReactiveEffect } from "./effect";
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
  return createResourceInternal(getter, false);
}

/**
 * Creates a resource from a callback that may return either a value or a
 * PromiseLike. Synchronous callbacks without owned descendants roll back
 * their identity allocation transaction; async or suspended callbacks commit it.
 */
export function createMaybeAsyncResource<T>(getter: () => T | PromiseLike<T>): VynnRef<T> {
  return createResourceInternal(getter, true);
}

function createResourceInternal<T>(
  getter: () => T | PromiseLike<T>,
  detectPromiseLike: boolean,
): VynnRef<T> {
  const owner = getOwner();
  const lazyGetter = isAsyncGetterFromLazy(getter);
  const resourceOwner = owner
    ? detectPromiseLike && !lazyGetter
      ? createOwnerIdentityTransaction(owner)
      : createOwner(owner)
    : null;
  const effectOwner = resourceOwner ?? owner;
  const record = createCell<ResourceRecord<T> | undefined>(undefined);

  let version = 0;
  let started = false;

  let resourceOwnerID: string | undefined =
    lazyGetter || detectPromiseLike ? undefined : resourceOwner?.id;
  let asyncValues = getAsyncValues();
  let hasReadHydrationValue = false;
  let hydrationValue: { found: boolean; value: T | undefined } | undefined;
  let initialResultKind: "unknown" | "sync" | "async" | "error" = "unknown";

  // The reactive effect mutates this state from inside its callback. Read it
  // through an accessor outside that callback so TypeScript doesn't retain
  // the initializer's initial "unknown" narrowing.
  function getInitialResultKind(): "unknown" | "sync" | "async" | "error" {
    return initialResultKind;
  }

  let initialValue!: T;
  let initialError: unknown;
  let hasCompletedStart = false;
  let reactiveEffect: ReturnType<typeof createReactiveEffect> | undefined;
  let activationOwner: Owner | null = owner;

  function getCandidateOwnerID(): string | undefined {
    return resourceOwner
      ? (getOwnerIdentityID(resourceOwner) ?? peekOwnerID(resourceOwner.parent))
      : peekOwnerID(activationOwner);
  }

  function allocateResourceIdentity(): void {
    if (lazyGetter) return;

    if (resourceOwnerID !== undefined) return;

    resourceOwnerID = resourceOwner
      ? commitOwnerIdentityTransaction(resourceOwner)
      : createOwnerID(activationOwner);
  }

  function finalizeSynchronousInitializer(): void {
    if (!detectPromiseLike || !reactiveEffect) return;

    stopReactiveEffect(reactiveEffect);

    if (!resourceOwner) return;

    const hasOwnedIdentityWork = resourceOwner.children.length > 0 || resourceOwner.nodeCount > 0;
    const hasLifetimeWork = resourceOwner.cleanups.length > 1 || resourceOwner.mount.length > 0;

    if (hasOwnerIdentityTransaction(resourceOwner)) {
      if (hasOwnedIdentityWork) {
        allocateResourceIdentity();
      } else {
        rollbackOwnerIdentityTransaction(resourceOwner);
      }

      if (!hasOwnedIdentityWork && !hasLifetimeWork) {
        disposeOwner(resourceOwner);
      }
      return;
    }

    if (!resourceOwner.id && !hasOwnedIdentityWork && !hasLifetimeWork) {
      disposeOwner(resourceOwner);
    }
  }

  function start(): void {
    if (started) return;
    started = true;

    activationOwner = getOwner();

    if (!lazyGetter && !detectPromiseLike && resourceOwnerID === undefined) {
      resourceOwnerID = createOwnerID(activationOwner);
    }

    if (!asyncValues) asyncValues = getAsyncValues();

    const effect = createReactiveEffect(
      () => {
        const currentVersion = ++version;
        const isInitialRun = detectPromiseLike && initialResultKind === "unknown";
        let hydrationProbeCompleted = false;

        try {
          let result: T | PromiseLike<T>;

          if (detectPromiseLike && isInitialRun && !lazyGetter) {
            const candidateOwnerID = getCandidateOwnerID();

            if (
              candidateOwnerID !== undefined &&
              (hasAsyncHydrationValue(candidateOwnerID) ||
                hasAsyncHydrationOwnerIDReservation(candidateOwnerID))
            ) {
              // A fake pass classifies a maybe-async initializer only when
              // the next owner ID has a serialized value to hydrate.
              const probe = withFakeAsyncApis(getter);
              hydrationProbeCompleted = true;

              if (!isPromiseLike<T>(probe)) {
                initialResultKind = "sync";
                initialValue = probe;

                // A server-side suspension may have committed this slot even
                // though hydrated dependencies let the initializer finish
                // synchronously on the client.
                if (hasAsyncHydrationOwnerIDReservation(candidateOwnerID)) {
                  allocateResourceIdentity();
                }

                record.value = {
                  status: "resolved",
                  value: probe,
                  version: currentVersion,
                };

                if (hasCompletedStart) {
                  finalizeSynchronousInitializer();
                }

                return;
              }

              initialResultKind = "async";
              allocateResourceIdentity();

              if (resourceOwnerID === candidateOwnerID) {
                hydrationValue = getAsyncValue<T>(candidateOwnerID);
                hasReadHydrationValue = true;
              }
            }
          } else if (!lazyGetter && resourceOwnerID !== undefined && !hasReadHydrationValue) {
            hydrationValue = getAsyncValue<T>(resourceOwnerID);
            hasReadHydrationValue = true;
          }

          if (hydrationValue?.found) {
            if (!hydrationProbeCompleted) withFakeAsyncApis(getter);

            const value = hydrationValue.value as T;
            hydrationValue = undefined;

            if (detectPromiseLike && isInitialRun) {
              initialResultKind = "async";
            }

            record.value = {
              status: "resolved",
              value,
              version: currentVersion,
            };
            return;
          }

          result = getter();

          if (!isPromiseLike<T>(result)) {
            if (detectPromiseLike && isInitialRun && initialResultKind === "unknown") {
              initialResultKind = "sync";
              initialValue = result as T;
            }

            record.value = {
              status: "resolved",
              value: result as T,
              version: currentVersion,
            };

            if (detectPromiseLike && isInitialRun && hasCompletedStart) {
              finalizeSynchronousInitializer();
            }

            return;
          }

          if (detectPromiseLike && isInitialRun && initialResultKind === "unknown") {
            initialResultKind = "async";
          }

          allocateResourceIdentity();

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

              runWithOwner(effectOwner, () => {
                if (asyncValues && resourceOwnerID !== undefined) {
                  asyncValues[resourceOwnerID] = value;
                }

                record.value = {
                  status: "resolved",
                  value,
                  version: currentVersion,
                };
              });
            },
            (error: unknown) => {
              if (currentVersion !== version) return;

              runWithOwner(effectOwner, () => {
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
            // A suspended initializer must commit its identity transaction.
            // Otherwise a later sibling could claim the same ID before this
            // initializer retries and discovers its final sync/async result.
            if (
              detectPromiseLike &&
              isInitialRun &&
              resourceOwner &&
              hasOwnerIdentityTransaction(resourceOwner)
            ) {
              allocateResourceIdentity();

              if (resourceOwnerID !== undefined) {
                registerAsyncOwnerIDReservation(resourceOwnerID);
              }
            }

            record.value = {
              status: "pending",
              promise: error.promise,
              version: currentVersion,
            };
            return;
          }

          if (
            detectPromiseLike &&
            isInitialRun &&
            initialResultKind === "unknown" &&
            !hasCompletedStart
          ) {
            initialResultKind = "error";
            initialError = error;
            return;
          }

          record.value = {
            status: "rejected",
            error,
            version: currentVersion,
          };
        }
      },
      { phase: "render", owner: effectOwner },
    );

    reactiveEffect = effect;
    hasCompletedStart = true;

    if (
      detectPromiseLike &&
      (getInitialResultKind() === "sync" || getInitialResultKind() === "error")
    ) {
      finalizeSynchronousInitializer();
    }

    if (getInitialResultKind() === "error") {
      throw initialError;
    }
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
        if (!import.meta.env.SSR || !lazyGetter) {
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
    if (import.meta.env.SSR) {
      void resource.value;
    }

    return record.value?.status === "pending";
  });

  // Ownerless module resources are activated by their first read so they can
  // acquire the request-local hydration scope of the render that consumes them.
  if (owner !== null || resourceOwnerID !== undefined) start();

  if (detectPromiseLike && owner !== null && getInitialResultKind() === "sync") {
    return createCell(initialValue);
  }

  return resource;
}
