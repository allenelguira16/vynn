import { getCurrentOwner } from "./owner";

export type DestroyFn = () => void;

export function onDestroy(callback: DestroyFn): void {
  const owner = getCurrentOwner();

  if (!owner) {
    throw new Error("onDestroy must be called within a component");
  }

  owner.cleanups.push(callback);
}
