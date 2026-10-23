import { getOwner, getContext, modifyContext } from "../life-cycle/owner";

export function initializeAsyncID() {
  const owner = getOwner();

  if (!owner)
    throw new Error("[vynn]: initializeAsyncID must be inside owner context");

  owner.context.set("$async-id", 0);
}

export function getAsyncID() {
  let asyncID = getContext<number>("$async-id")!;

  if (asyncID == null)
    throw new Error(
      "[vynn]: initializeAsyncID is not yet initialized, run it first before using getAsyncID",
    );

  modifyContext<number>("$async-id", (current) => current + 1);

  return asyncID;
}
