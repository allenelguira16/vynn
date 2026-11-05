import { isServer } from "./is-server-context";

// Promise identity is enough here: each SSR render creates its own resources,
// and WeakSet keeps completed route-load promises from being retained.
const blockingTasks = new WeakSet<Promise<unknown>>();

/**
 * Marks an async task as part of the initial SSR document decision.
 * Streaming SSR waits for marked Await boundaries before emitting the document.
 */
export function registerSsrBlockingTask(promise: Promise<unknown>): void {
  if (isServer()) {
    blockingTasks.add(promise);
  }
}

/** Internal check used by the streaming renderer. */
export function isSsrBlockingTask(promise: Promise<unknown>): boolean {
  return blockingTasks.has(promise);
}
