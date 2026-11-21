import { runWithOwner, type Owner } from "../life-cycle/owner";
import {
  createMaybeAsyncResource,
  createMaybeAsyncResourceFromInitial,
  type MaybeAsyncResourceInitial,
} from "./resource";
import { NotReadyError } from "./not-ready-error";
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
