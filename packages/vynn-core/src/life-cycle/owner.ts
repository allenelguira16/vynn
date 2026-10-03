export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  mount: (() => void | (() => void))[];
  disposed?: boolean;
  context: Map<string | symbol, any>;
}

let currentOwner: Owner | null = null;

/**
 * Returns the owner currently associated with the executing code.
 *
 * @returns The current owner, or `null` when no owner is active.
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
  };

  parent?.children.push(owner);

  return owner;
}

/**
 * Runs a function with the specified owner as the current owner.
 *
 * The previous owner is restored after the function completes, including
 * when the function throws an error.
 *
 * @param owner The owner to make active while the function runs.
 * @param fn The function to execute with the owner active.
 * @returns The value returned by `fn`.
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
 * Disposal runs child cleanups first, followed by the owner's own cleanups,
 * then detaches the owner from its parent.
 *
 * Calling this function on an already disposed owner has no effect.
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
 * Sets a value in the context of the current owner.
 *
 * If no owner is active, the value is ignored.
 *
 * @param key The context key.
 * @param value The value to store in the current owner's context.
 */
export function setOwnerContext<T>(key: string | symbol, value: T): void {
  const owner = currentOwner;

  if (!owner) {
    return;
  }

  owner.context.set(key, value);
}

/**
 * Retrieves a value from the current owner's context hierarchy.
 *
 * The current owner is checked first, followed by each parent owner until
 * a matching context value is found.
 *
 * @param key The context key.
 * @returns The nearest matching context value, or `undefined` when none exists.
 */
export function getOwnerContext<T>(key: string | symbol): T | undefined {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key);
    }

    owner = owner.parent;
  }

  return undefined;
}
