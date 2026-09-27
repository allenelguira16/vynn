import { getCurrentOwner } from "./owner";

export type DestroyFn = () => void;

/**
 * Registers a callback to run when the current component is destroyed.
 *
 * Must be called while a component owner is active.
 *
 * @param callback The function to run when the component is destroyed.
 */
export function onDestroy(callback: DestroyFn): void {
  const owner = getCurrentOwner();

  if (!owner) {
    throw new Error("onDestroy must be called within a component");
  }

  owner.cleanups.push(callback);
}
