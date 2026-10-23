import { getOwner, getContext, modifyContext } from "../life-cycle/owner";

export function initializeLazyID() {
  const owner = getOwner();

  if (!owner)
    throw new Error("[vynn]: initializeLazyID must be inside owner context");

  owner.context.set("$lazy-id", 0);
}

export function getLazyID() {
  const lazyID = getContext<number>("$lazy-id");

  if (lazyID == null)
    throw new Error(
      "[vynn]: initializeLazyID is not yet initialized, run it first before using getLazyID",
    );

  modifyContext<number>("$lazy-id", (currentID) => currentID + 1);

  return lazyID;
}
