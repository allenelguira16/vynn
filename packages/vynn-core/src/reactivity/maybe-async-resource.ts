import { runWithOwner, type Owner } from "../life-cycle/owner";
import {
  createMaybeAsyncResource,
  createMaybeAsyncResourceFromInitial,
  type MaybeAsyncResourceInitial,
} from "./resource";
import { NotReadyError } from "./not-ready-error";
import type { VynnRef } from "./ref";

export type MaybeAsyncResourceControl = {
  hasRead(): boolean;
  getReadOwner(): Owner | null;
};

export async function createLegacyMaybeAsyncResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner | null,
  control: MaybeAsyncResourceControl,
): Promise<VynnRef<T>> {
  const activationOwner = control.hasRead() ? control.getReadOwner() : owner;
  const resource = runWithOwner(activationOwner, () => createMaybeAsyncResource(initializer));
  await waitForInitialValue(resource, activationOwner);
  return resource;
}

export async function createPromotedMaybeAsyncResource<T>(
  initializer: () => T | PromiseLike<T>,
  owner: Owner,
  resourceOwner: Owner,
  initial: MaybeAsyncResourceInitial<T>,
): Promise<VynnRef<T>> {
  if (owner.disposed || resourceOwner.disposed) {
    throw new Error("[vynn]: Cannot promote state after its owner was disposed.");
  }

  const resource = runWithOwner(owner, () =>
    createMaybeAsyncResourceFromInitial(initializer, resourceOwner, initial),
  );
  await waitForInitialValue(resource, owner);
  return resource;
}

export async function waitForInitialValue<T>(
  resource: VynnRef<T>,
  owner: Owner | null,
): Promise<void> {
  while (true) {
    try {
      runWithOwner(owner, () => {
        void resource.value;
      });
      return;
    } catch (error) {
      if (!(error instanceof NotReadyError)) return;

      try {
        await error.promise;
      } catch {
        // Resource rejections are stored internally and surfaced on retry.
      }
    }
  }
}
