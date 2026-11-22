import { getOwner, type Owner } from "../life-cycle/owner";

/**
 * Reads a value from the nearest Owner that defines the key.
 *
 * Owner context follows the component hierarchy and is independent of
 * RuntimeContext frames, so it remains available when an Owner is re-entered
 * by a deferred render or callback.
 */
export function getOwnerContext<T>(key: string | symbol): T | undefined {
  let owner = getOwner();

  while (owner) {
    if (owner.context.has(key)) return owner.context.get(key) as T;
    owner = owner.parent;
  }

  return undefined;
}

/** Writes a value on the currently executing Owner. */
export function setOwnerContext<T>(key: string | symbol, value: T): void {
  getOwner()?.context.set(key, value);
}

/** Updates the nearest existing value without shadowing it on a descendant. */
export function modifyOwnerContext<T>(
  key: string | symbol,
  updater: (current: T) => T,
): boolean {
  let owner: Owner | null = getOwner();

  while (owner) {
    if (owner.context.has(key)) {
      owner.context.set(key, updater(owner.context.get(key) as T));
      return true;
    }
    owner = owner.parent;
  }

  return false;
}
