import { getOwner, getContext } from "../life-cycle/owner";
import { getRenderMode } from "./render-mode";

export function initializeAsyncValues() {
  const owner = getOwner();

  if (!owner)
    throw new Error(
      "[vynn]: initializeAsyncValues must be inside owner context",
    );

  if (!getRenderMode()) {
    return;
  }

  owner.context.set("$async-values", []);
}

export function getAsyncValues() {
  return getContext<any[]>("$async-values");
}

export function getAsyncValue(asyncID: number) {
  if (!getRenderMode()) {
    (window as any).__vynnAsyncData ??= [];
    try {
      return (window as any).__vynnAsyncData[asyncID];
    } finally {
      delete (window as any).__vynnAsyncData[asyncID];
    }
  }

  return undefined;
}
