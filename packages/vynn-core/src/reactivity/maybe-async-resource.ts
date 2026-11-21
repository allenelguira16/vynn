import { runWithOwner, type Owner } from "../life-cycle/owner";
import {
  createMaybeAsyncResource,
  createMaybeAsyncResourceFromInitial,
  type MaybeAsyncResourceInitial,
} from "./resource";
import type { VynnRef } from "./ref";

export type MaybeAsyncResourceControl<T> = {
  attach(resource: VynnRef<T>): void;
  hasRead(): boolean;
  getReadOwner(): Owner | null;
};

export function createLegacyMaybeAsyncResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner | null,
  control: MaybeAsyncResourceControl<T>,
): VynnRef<T> {
  const activationOwner = control.hasRead() ? control.getReadOwner() : owner;
  const resource = runWithOwner(activationOwner, () => createMaybeAsyncResource(initializer));
  control.attach(resource);
  return resource;
}

export function createPromotedMaybeAsyncResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner,
  resourceOwner: Owner,
  initial: MaybeAsyncResourceInitial<T>,
  control: MaybeAsyncResourceControl<T>,
): VynnRef<T> {
  if (owner.disposed || resourceOwner.disposed) {
    throw new Error("[vynn]: Cannot promote state after its owner was disposed.");
  }

  const resource = runWithOwner(owner, () =>
    createMaybeAsyncResourceFromInitial(initializer, resourceOwner, initial),
  );
  control.attach(resource);
  return resource;
}
