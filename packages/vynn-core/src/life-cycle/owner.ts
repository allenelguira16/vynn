export interface OwnerBoundaryHandlers {
  onError?: (error: Error) => void;
  onPending?: (promise: Promise<unknown>) => void;
}

export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  mount: (() => void | (() => void))[];
  disposed?: boolean;
  context: Map<string | symbol, unknown>;
  nodeCount: number;
  /** Stable component-tree identity used by async resource hydration. */
  componentID?: string;
  nextComponentID: number;
  nextAsyncResourceID: number;
  boundary?: OwnerBoundaryHandlers;
}

let currentOwner: Owner | null = null;

/**
 * Returns the owner currently associated with the executing code.
 *
 * @returns The current owner, or null when no owner is active.
 */
export function getOwner(): Owner | null {
  return currentOwner;
}

/**
 * Finds the nearest boundary handler of the requested kind in an owner's
 * ancestry. Boundary handlers are runtime ownership metadata, not general
 * user context values.
 */
export function getOwnerBoundaryHandler<K extends keyof OwnerBoundaryHandlers>(
  key: K,
  owner: Owner | null = currentOwner,
): OwnerBoundaryHandlers[K] | undefined {
  let current = owner;

  while (current) {
    const handler = current.boundary?.[key];
    if (handler) return handler;

    current = current.parent;
  }

  return undefined;
}

/**
 * Installs or clears a boundary handler directly on an owner.
 */
export function setOwnerBoundaryHandler<K extends keyof OwnerBoundaryHandlers>(
  key: K,
  handler: OwnerBoundaryHandlers[K] | undefined,
  owner: Owner | null = currentOwner,
): void {
  if (!owner) return;

  const boundary = (owner.boundary ??= {});
  boundary[key] = handler;
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
    context: new Map<string | symbol, unknown>(),
    nodeCount: 0,
    componentID: parent ? undefined : "root",
    nextComponentID: 0,
    nextAsyncResourceID: 0,
  };

  parent?.children.push(owner);

  return owner;
}

/**
 * Creates an owner for a component. Component IDs are assigned among
 * component owners rather than all runtime owners, so internal boundary and
 * branch owners do not affect async resource identity.
 */
export function createComponentOwner(parent = currentOwner): Owner {
  const owner = createOwner(parent);
  let componentParent = parent;

  while (componentParent && componentParent.componentID === undefined) {
    componentParent = componentParent.parent;
  }

  if (componentParent) {
    owner.componentID = `${componentParent.componentID}.${componentParent.nextComponentID++}`;
  } else {
    owner.componentID = "root";
  }

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
  const errors: unknown[] = [];

  for (const child of [...owner.children]) {
    try {
      disposeOwner(child);
    } catch (error) {
      errors.push(error);
    }
  }

  owner.children.length = 0;

  for (const cleanup of owner.cleanups.splice(0)) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }

  if (owner.parent) {
    const index = owner.parent.children.indexOf(owner);

    if (index !== -1) {
      owner.parent.children.splice(index, 1);
    }
  }

  owner.parent = null;

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, "[Vynn] Multiple owner cleanups failed.");
  }
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
export function setContext<T>(key: string | symbol, value: T): void {
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
export function updateContext<T>(key: string | symbol, value: T): boolean {
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
export function modifyContext<T>(key: string | symbol, updater: (current: T) => T): boolean {
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
export function getContext<T>(key: string | symbol): T | undefined {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key) as T;
    }

    owner = owner.parent;
  }

  return undefined;
}
