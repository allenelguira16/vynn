// LAZY PROMISES

const promisesInLazy = new WeakSet<Promise<unknown>>();

export function registerPromiseFromLazy(promise: Promise<unknown>) {
  promisesInLazy.add(promise);
}

export function isPromiseFromLazy(promise: Promise<unknown>) {
  return promisesInLazy.has(promise);
}

// LAZY GETTERS

const gettersInLazy = new WeakSet<object>();

export function regsterAsyncGetterFromLazy(getter: object) {
  gettersInLazy.add(getter);
}

export function isAsyncGetterFromLazy(getter: object) {
  return gettersInLazy.has(getter);
}
