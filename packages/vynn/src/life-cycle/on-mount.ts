import { getCurrentOwner } from "./owner";

// export type DestroyFn = () => void;

// export type MountFn = () => void | DestroyFn;

export function onMount(callback: () => Function): void;
export function onMount(callback: Function): void;
export function onMount(callback: Function | (() => Function)): void {
  const owner = getCurrentOwner();

  if (!owner) {
    throw new Error("onMount must be called within a component");
  }

  queueMicrotask(() => {
    const cleanup = callback();

    if (typeof cleanup === "function") {
      owner.cleanups.push(cleanup);
    }
  });
}
