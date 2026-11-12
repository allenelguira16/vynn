const pendingAccessors = new WeakMap<object, () => boolean>();

export function registerPending(value: object, accessor: () => boolean): void {
  pendingAccessors.set(value, accessor);
}

export function isPending(value: object): boolean {
  return pendingAccessors.get(value)?.() ?? false;
}
