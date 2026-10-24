import { getContext, modifyContext, setContext } from "../life-cycle/owner";

const LAZY_ID = Symbol("vynn.lazy-id");

export function initializeLazyContext() {
  setContext(LAZY_ID, 0);
}

export function getLazyID() {
  const lazyID = getContext<number>(LAZY_ID);

  if (lazyID == null)
    throw new Error(
      "[vynn]: initializeLazyContext is not yet initialized, run it first before using getLazyID",
    );

  modifyContext<number>(LAZY_ID, (currentID) => currentID + 1);

  return lazyID;
}
