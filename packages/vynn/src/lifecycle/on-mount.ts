import { isServer } from "~/util/server-util";

import { DestroyFn } from "./on-destroy";
import { getOwner } from "./owner";

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

  const owner = getOwner();
  if (!owner) {
    throw new Error("onMount called outside of component");
  }

  queueMicrotask(async () => {
    const cleanup = await fn();

    if (cleanup instanceof Function) {
      owner.cleanups.push(cleanup);
    }
  });
  // (fn);

  // if (isServer) return;

  // const context = getRuntimeContext();
  // if (!context) {
  //   throw new Error("onMount called outside of component");
  // }

  // context.mount.push(fn);
}
