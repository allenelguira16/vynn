import { getContext, modifyContext, setContext } from "../life-cycle/owner";

// LAZY ID CONTEXT

const LAZY_ID = Symbol("vynn.lazy-id");
const USED_LAZY_MODULES = Symbol("vynn.used-lazy-modules");

export function initializeLazyContext() {
  setContext(LAZY_ID, 0);
  const modules = new Set<string>();
  setContext(USED_LAZY_MODULES, modules);
  return modules;
}

/** Records a lazy module only when its component participates in an SSR render. */
export function registerUsedLazyModule(moduleId: string | undefined) {
  if (!moduleId) return;
  getContext<Set<string>>(USED_LAZY_MODULES)?.add(moduleId);
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

// LAZY PROMISES

const promisesInLazy = new Set<Promise<any>>();

export function registerPromiseFromLazy(promise: Promise<any>) {
  promisesInLazy.add(promise);
}

export function isPromiseFromLazy(promise: Promise<any>) {
  return promisesInLazy.has(promise);
}

// LAZY GETTERS

const gettersInLazy = new Set<() => any>();

export function regsterAsyncGetterFromLazy<T = any>(getter: () => T) {
  return gettersInLazy.add(getter);
}

export function isAsyncGetterFromLazy<T = any>(getter: () => T) {
  return gettersInLazy.has(getter);
}
