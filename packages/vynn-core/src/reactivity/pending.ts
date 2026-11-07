const pendingAccessors = new WeakMap<object, () => boolean>();

/**
 * Associates a reactive value with its pending-state accessor.
 */
export function registerPending(value: object, accessor: () => boolean): void {
  pendingAccessors.set(value, accessor);
}

/**
 * Returns whether an asynchronous reactive value is currently refreshing.
 */
export function isPending(value: object): boolean {
  return pendingAccessors.get(value)?.() ?? false;
}
