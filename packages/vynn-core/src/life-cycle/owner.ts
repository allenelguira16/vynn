export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  mount: (() => void | (() => void))[];
  disposed?: boolean;
  context: Map<string | symbol, any>;
  nodeCount: number;
}

let currentOwner: Owner | null = null;

/**
 * Returns the owner currently associated with the executing code.
 *
 * @returns The current owner, or null when no owner is active.
 */
export function getCurrentOwner(): Owner | null {
  return currentOwner;
}

/**
 * Creates a new owner and optionally attaches it to a parent owner.
 *
 * By default, the current owner is used as the parent.
 *
 * @param parent The parent owner, or the current owner when omitted.
 * @returns The newly created owner.
 */
export function createOwner(parent = currentOwner): Owner {
  const owner: Owner = {
    parent,
    children: [],
    cleanups: [],
    mount: [],
    context: new Map(),
    nodeCount: 0,
  };

  parent?.children.push(owner);

  return owner;
}

/**
 * Runs a function with the specified owner as the current owner.
 *
 * The previous owner is restored after execution, including when the
 * function throws an error.
 *
 * @param owner The owner to activate.
 * @param fn The function to execute.
 * @returns The function's return value.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const previousOwner = currentOwner;

  currentOwner = owner;

  try {
    return fn();
  } finally {
    currentOwner = previousOwner;
  }
}

/**
 * Disposes an owner and all of its descendants.
 *
 * Children are disposed before the current owner's cleanups run.
 *
 * @param owner The owner to dispose.
 */
export function disposeOwner(owner: Owner): void {
  if (owner.disposed) {
    return;
  }

  owner.disposed = true;

  for (const child of [...owner.children]) {
    disposeOwner(child);
  }

  owner.children.length = 0;

  for (const cleanup of owner.cleanups.splice(0)) {
    cleanup();
  }

  if (owner.parent) {
    const index = owner.parent.children.indexOf(owner);

    if (index !== -1) {
      owner.parent.children.splice(index, 1);
    }
  }

  owner.parent = null;
}

/**
 * Sets a context value on the current owner.
 *
 * This always writes to the current owner, creating a local context entry
 * even if the same key exists on a parent.
 *
 * @param key The context key.
 * @param value The value to store.
 */
export function setOwnerContext<T>(key: string | symbol, value: T): void {
  const owner = currentOwner;

  if (!owner) {
    return;
  }

  owner.context.set(key, value);
}

/**
 * Updates the nearest existing context entry in the owner hierarchy.
 *
 * Unlike setOwnerContext(), this does not create a new entry or shadow
 * an inherited context value.
 *
 * @param key The context key.
 * @param value The replacement value.
 * @returns Whether an existing context entry was updated.
 */
export function updateOwnerContext<T>(key: string | symbol, value: T): boolean {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      owner.context.set(key, value);
      return true;
    }

    owner = owner.parent;
  }

  return false;
}

/**
 * Updates an existing context value using an updater function.
 *
 * The updater receives the current value and returns its replacement.
 * The nearest owner containing the key is updated.
 *
 * @param key The context key.
 * @param updater A function that computes the replacement value.
 * @returns Whether an existing context entry was updated.
 */
export function modifyOwnerContext<T>(
  key: string | symbol,
  updater: (current: T) => T,
): boolean {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      const current = owner.context.get(key) as T;
      owner.context.set(key, updater(current));

      return true;
    }

    owner = owner.parent;
  }

  return false;
}

/**
 * Retrieves a context value from the current owner hierarchy.
 *
 * The current owner is checked first, followed by its ancestors.
 *
 * @param key The context key.
 * @returns The nearest matching value, or undefined if none exists.
 */
export function getOwnerContext<T>(key: string | symbol): T | undefined {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key) as T;
    }

    owner = owner.parent;
  }

  return undefined;
}
