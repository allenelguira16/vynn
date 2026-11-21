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
import { createReactiveEffect, stopReactiveEffect, track, trigger, untrack } from "./effect";
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

export type ResourceOptions = {
  /** Keep synchronous results reactive, as required by $computed. */
  computed?: boolean;
};

/**
 * Runs the getter in a reactive effect and classifies its actual return value.
 * Synchronous state initializers become cells; PromiseLike results use the
 * async resource lifecycle. Computed resources keep tracking synchronous
 * results and can transition to async when a later run returns a promise.
 */
export function createResource<T>(
  getter: () => T | PromiseLike<T>,
  options: ResourceOptions = {},
): VynnRef<T> {
  const { computed = false } = options;
  const owner = getOwner();
  const lazyGetter = isAsyncGetterFromLazy(getter);
  let resourceOwner = owner && lazyGetter ? createOwner(owner) : null;
  let effectOwner: Owner | null = resourceOwner ?? owner;
  let record: VynnRef<ResourceRecord<T> | undefined> | undefined = computed
    ? createCell<ResourceRecord<T> | undefined>(undefined)
    : undefined;

  let version = 0;
  let started = false;
  let resourceOwnerID: string | undefined = lazyGetter ? undefined : resourceOwner?.id;
  let asyncValues = getAsyncValues();
  let hasReadHydrationValue = false;
  let hydrationValue: { found: boolean; value: T | undefined } | undefined;
  let initialResultKind: "unknown" | "sync" | "async" | "suspended" | "error" = "unknown";
  let hasObservedPromise = false;
  let computedDirty = false;
  let readingComputed = false;
  const computedTarget = {};

  let initialValue!: T;
  let initialError: unknown;
  let hasCompletedStart = false;
  let reactiveEffect: ReturnType<typeof createReactiveEffect> | undefined;
  let activationOwner: Owner | null = owner;

  function setRecord(next: ResourceRecord<T>): void {
    if (!record) {
      record = createCell<ResourceRecord<T> | undefined>(undefined);
    }

    record.value = next;

    // Computed consumers track this resource's public value rather than the
    // internal record cell, avoiding duplicate notifications during a read.
    if (computed && !readingComputed) trigger(computedTarget, "value");
  }

  function observePromise(): void {
    hasObservedPromise = true;

    // Once the getter is asynchronous, refresh it like a resource effect.
    // The default render scheduler preserves batching and eager refreshes.
    if (computed && reactiveEffect) {
      reactiveEffect.scheduler = undefined;
    }
  }

  function runForComputedRead(callback: () => void): void {
    const previous = readingComputed;
    readingComputed = true;

    try {
      callback();
    } finally {
      readingComputed = previous;
    }
  }

  function getCandidateOwnerID(): string | undefined {
    return resourceOwner
      ? (getOwnerIdentityID(resourceOwner) ?? peekOwnerID(resourceOwner.parent))
      : peekOwnerID(activationOwner);
  }

  function allocateResourceIdentity(): void {
    if (lazyGetter || resourceOwnerID !== undefined) return;

    if (!resourceOwner && computed && owner) {
      resourceOwner = createOwner(owner);
      effectOwner = resourceOwner;
    }

    resourceOwnerID = resourceOwner
      ? commitOwnerIdentityTransaction(resourceOwner)
      : createOwnerID(activationOwner);
  }

  function finalizeSynchronousInitializer(): void {
    if (!reactiveEffect) return;

    if (!computed) stopReactiveEffect(reactiveEffect);
    if (!resourceOwner) return;

    const hasOwnedIdentityWork = resourceOwner.children.length > 0 || resourceOwner.nodeCount > 0;
    const hasLifetimeWork =
      (computed ? resourceOwner.cleanups.length > 0 : resourceOwner.cleanups.length > 1) ||
      resourceOwner.mount.length > 0;

    if (hasOwnerIdentityTransaction(resourceOwner)) {
      if (hasOwnedIdentityWork || hasLifetimeWork) {
        allocateResourceIdentity();
      } else {
        rollbackOwnerIdentityTransaction(resourceOwner);

        if (computed) {
          const unusedOwner = resourceOwner;
          resourceOwner = null;
          effectOwner = owner;
          disposeOwner(unusedOwner);
        } else {
          disposeOwner(resourceOwner);
        }
      }
      return;
    }

    if (!computed && !resourceOwner.id && !hasOwnedIdentityWork && !hasLifetimeWork) {
      disposeOwner(resourceOwner);
    }
  }

  function start(): void {
    if (started) return;
    started = true;

    activationOwner = owner ?? getOwner();

    // Allocate a tentative owner only when evaluation begins, then commit it
    // only if the getter is async, suspends, or creates owned descendants.
    if (!computed && !resourceOwner && owner) {
      resourceOwner = createOwnerIdentityTransaction(owner);
      effectOwner = resourceOwner;
    }

    if (!asyncValues) asyncValues = getAsyncValues();

    const effect = createReactiveEffect(
      () => {
        const currentVersion = ++version;

        if (computed && !resourceOwner && owner) {
          resourceOwner = createOwnerIdentityTransaction(owner);
          effectOwner = resourceOwner;
        }

        const isInitialRun = initialResultKind === "unknown";
        let hydrationProbeCompleted = false;

        try {
          let result: T | PromiseLike<T>;

          if (isInitialRun && !lazyGetter) {
            const candidateOwnerID = getCandidateOwnerID();

            if (
              candidateOwnerID !== undefined &&
              (hasAsyncHydrationValue(candidateOwnerID) ||
                hasAsyncHydrationOwnerIDReservation(candidateOwnerID))
            ) {
              // Probe only when the candidate slot has serialized data. Fake
              // async APIs collect synchronous dependencies without refetching.
              const probe = withFakeAsyncApis(() => runWithOwner(effectOwner, getter));
              hydrationProbeCompleted = true;

              if (!isPromiseLike<T>(probe)) {
                initialResultKind = "sync";
                initialValue = probe;

                // The server may have reserved this slot after suspension,
                // even though hydrated dependencies now make the getter sync.
                if (hasAsyncHydrationOwnerIDReservation(candidateOwnerID)) {
                  allocateResourceIdentity();
                }

                if (computed || owner === null) {
                  setRecord({
                    status: "resolved",
                    value: probe,
                    version: currentVersion,
                  });
                }

                if (hasCompletedStart) finalizeSynchronousInitializer();
                return;
              }

              initialResultKind = "async";
              observePromise();
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
            if (!hydrationProbeCompleted) {
              withFakeAsyncApis(() => runWithOwner(effectOwner, getter));
            }

            const value = hydrationValue.value as T;
            hydrationValue = undefined;

            if (isInitialRun) {
              initialResultKind = "async";
              observePromise();
            }

            setRecord({
              status: "resolved",
              value,
              version: currentVersion,
            });
            return;
          }

          result = runWithOwner(effectOwner, getter);

          if (!isPromiseLike<T>(result)) {
            if (isInitialRun && initialResultKind === "unknown") {
              initialResultKind = "sync";
              initialValue = result as T;
            }

            if (computed || owner === null || !isInitialRun) {
              setRecord({
                status: "resolved",
                value: result as T,
                version: currentVersion,
              });
            }

            if (hasCompletedStart && (isInitialRun || computed)) {
              finalizeSynchronousInitializer();
            }
            return;
          }

          if (isInitialRun && initialResultKind === "unknown") {
            initialResultKind = "async";
          }

          observePromise();
          allocateResourceIdentity();

          const promise = Promise.resolve(result);

          if (lazyGetter) registerPromiseFromLazy(promise);

          setRecord({
            status: "pending",
            promise,
            version: currentVersion,
          });

          promise.then(
            (value) => {
              if (currentVersion !== version) return;

              runWithOwner(effectOwner, () => {
                if (asyncValues && resourceOwnerID !== undefined) {
                  asyncValues[resourceOwnerID] = value;
                }

                setRecord({
                  status: "resolved",
                  value,
                  version: currentVersion,
                });
              });
            },
            (error: unknown) => {
              if (currentVersion !== version) return;

              runWithOwner(effectOwner, () => {
                if (error instanceof NotReadyError) {
                  setRecord({
                    status: "pending",
                    promise: error.promise,
                    version: currentVersion,
                  });
                  return;
                }

                setRecord({
                  status: "rejected",
                  error,
                  version: currentVersion,
                });
              });
            },
          );
        } catch (error) {
          if (error instanceof NotReadyError) {
            // A suspended initializer may resolve synchronously after hydration,
            // or return its own promise after a dependency becomes available.
            // Reserve its position now so sibling identities remain stable.
            if (isInitialRun && initialResultKind === "unknown") {
              initialResultKind = "suspended";
              allocateResourceIdentity();

              if (resourceOwnerID !== undefined) {
                registerAsyncOwnerIDReservation(resourceOwnerID);
              }
            } else if (
              computed &&
              resourceOwner !== null &&
              hasOwnerIdentityTransaction(resourceOwner)
            ) {
              // A previously synchronous computed may suspend on a later run.
              // Reserve its position before another sibling can claim it.
              allocateResourceIdentity();

              if (resourceOwnerID !== undefined) {
                registerAsyncOwnerIDReservation(resourceOwnerID);
              }
            }

            if (computed) observePromise();

            setRecord({
              status: "pending",
              promise: error.promise,
              version: currentVersion,
            });
            return;
          }

          if (isInitialRun && initialResultKind === "unknown" && !hasCompletedStart) {
            initialResultKind = "error";
            initialError = error;
            setRecord({
              status: "rejected",
              error,
              version: currentVersion,
            });
            return;
          }

          setRecord({
            status: "rejected",
            error,
            version: currentVersion,
          });

          if (computed && hasCompletedStart) {
            finalizeSynchronousInitializer();
          }
        }
      },
      {
        phase: "render",
        // Computed effects live with their creating owner. Their temporary
        // resource owner scopes descendants and receives an ID only when needed.
        owner: computed ? owner : effectOwner,
        scheduler: computed
          ? () => {
              if (computedDirty) return;
              computedDirty = true;
              trigger(computedTarget, "value");
            }
          : undefined,
      },
    );

    reactiveEffect = effect;
    hasCompletedStart = true;

    if (computed && hasObservedPromise) {
      effect.scheduler = undefined;
    }

    if (initialResultKind === "sync" || initialResultKind === "error") {
      finalizeSynchronousInitializer();
    }

    if (initialResultKind === "error" && !computed) {
      throw initialError;
    }
  }

  // Owned state initializers and non-lazy computed getters evaluate eagerly.
  // A synchronous owned state initializer can return its cell immediately,
  // without allocating any async-resource wrapper or record.
  if (owner !== null || (computed && !lazyGetter)) start();

  if (!computed && owner !== null && initialResultKind === "sync") {
    return createCell(initialValue);
  }

  const resource = markRef({
    get value(): T {
      if (computed) {
        track(computedTarget, "value");

        if (computedDirty) {
          computedDirty = false;
          runForComputedRead(() => reactiveEffect?.run());
        }
      }

      if (!started) {
        if (computed) runForComputedRead(start);
        else start();
      }

      const current = computed ? untrack(() => record?.value) : record?.value;

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
      setRecord({
        status: "resolved",
        value: nextValue,
        version,
      });
    },
  }) as VynnRef<T>;

  registerPending(resource, () => {
    // During SSR, reading isPending() must participate in the same async
    // boundary as reading resource.value.
    if (import.meta.env.SSR) {
      void resource.value;
    }

    return record?.value?.status === "pending";
  });

  // Module-level state resources acquire the consuming request's owner on first read.
  return resource;
}
