import { getRenderMode } from "../utils/render-mode";
import { getCurrentOwner } from "./owner";

/**
 * Registers a callback to run when the current component is mounted.
 *
 * The callback may return a cleanup function that will be run when the
 * component is destroyed.
 *
 * Must be called while a component owner is active.
 *
 * @param callback The function to run after the component is mounted.
 */
export function onMount(callback: () => void): void;

export function onMount(callback: () => () => void): void;

export function onMount(callback: () => void | (() => void)): void {
  if (getRenderMode() === "sync") {
    return;
  }

  const owner = getCurrentOwner();

  if (!owner) {
    throw new Error("onMount must be called within a component");
  }

  owner.mount.push(callback);
}
