import { runWithOwner, type Owner } from "../life-cycle/owner";
import {
  createMaybeAsyncResource,
  createMaybeAsyncResourceFromInitial,
  type MaybeAsyncResourceInitial,
} from "./resource";
import type { VynnRef } from "./ref";

export function createLegacyMaybeAsyncResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner | null,
): VynnRef<T> {
  return runWithOwner(owner, () => createMaybeAsyncResource(initializer));
}

export function createPromotedMaybeAsyncResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner,
  resourceOwner: Owner,
  initial: MaybeAsyncResourceInitial<T>,
): VynnRef<T> {
  if (owner.disposed || resourceOwner.disposed) {
    throw new Error("[vynn]: Cannot promote state after its owner was disposed.");
  }

  return runWithOwner(owner, () =>
    createMaybeAsyncResourceFromInitial(initializer, resourceOwner, initial),
  );
}
