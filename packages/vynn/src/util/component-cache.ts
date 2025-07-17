import { getRuntimeContext } from "~/context";

const __componentCaches = new Map<string, any>();

/**
 * Cache a single value scoped to the current component.
 *
 * @param factory - The factory function to create the value.
 * @returns The cached value.
 */
export function componentCache<T>(factory: () => T): T {
  const owner = getRuntimeContext();

  if (!owner) {
    throw new Error("componentCache can only be used within a component context");
  }

  if (__componentCaches.has(owner.id)) {
    return __componentCaches.get(owner.id);
  }

  const value = factory();
  __componentCaches.set(owner.id, value);

  return value;
}
