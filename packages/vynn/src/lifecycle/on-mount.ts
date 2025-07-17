import { getRuntimeContext } from "~/context";
import { isServer } from "~/util";

import { DestroyFn } from "./on-destroy";

export type MountFn = () => Promise<void | DestroyFn> | (void | DestroyFn);

/**
 * on mount
 *
 * @param fn - The function to run on mount.
 */
export function onMount(fn: () => Promise<DestroyFn> | DestroyFn): void;
export function onMount(fn: () => Promise<void> | void): void;
export function onMount(fn: MountFn): void {
  if (isServer) return;

  const context = getRuntimeContext();
  if (!context) {
    throw new Error("onMount called outside of component");
  }

  context.mount.push(fn);
}
