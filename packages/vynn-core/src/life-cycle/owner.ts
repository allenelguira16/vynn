export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  mount: (() => void | (() => void))[];
  disposed?: boolean;
  context: Map<string | symbol, unknown>;
  /** Numeric child index within the nearest identity-bearing owner. */
  identityIndex: number | undefined;
  /** Nearest ancestor (or self) that owns the hydration ID sequence. */
  identityOwner: Owner | null;
  /** Number of identity-bearing children allocated by this owner. */
  nodeCount: number;
}

export type OwnerOptions = {
  /**
   * Transparent owners carry their parent's identity scope without consuming
   * a hydration ID. Use for lifecycle/context scopes absent from SSR markup.
   */
  identity?: boolean;
};

type OwnerIDReservations = Map<string, number>;
type OwnerIDTracker = Map<string, number>;

type OwnerIdentityTransaction = {
  identityParent: Owner | null;
  index: number | undefined;
  candidateIndex: number | undefined;
};

const ownerIdentityTransactions = new WeakMap<Owner, OwnerIdentityTransaction>();

const OWNER_ID_RESERVATIONS = Symbol("vynn.owner-id-reservations");
const OWNER_ID_TRACKERS = Symbol("vynn.owner-id-trackers");

let currentOwner: Owner | null = null;

function getOwnerContext<T>(owner: Owner | null, key: string | symbol): T | undefined {
  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key) as T;
    }

    owner = owner.parent;
  }

  return undefined;
}

/**
 * Resolve the numeric owner path, including an uncommitted identity
 * transaction. Paths remain stable across async completion and lazy scopes.
 */
export function getOwnerIdentityPath(owner: Owner | null): number[] | undefined {
  let current = owner?.identityOwner ?? null;
  if (!current) return undefined;
  const path: number[] = [];

  while (current) {
    const index = current.identityIndex ?? ownerIdentityTransactions.get(current)?.candidateIndex;
    if (index === undefined) return undefined;
    path.push(index);
    current = current.parent?.identityOwner ?? null;
  }

  path.reverse();
  return path;
}

/** Convert a numeric owner path to its hydration payload key. */
export function getOwnerIdentityPathKey(path: readonly number[]): string {
  return path.join(".");
}

function recordOwnerIDReservation(
  scopeOwner: Owner | null,
  identityParent: Owner,
  next: number,
): void {
  const parentPath = getOwnerIdentityPath(identityParent);
  if (!parentPath) return;
  const key = getOwnerIdentityPathKey(parentPath);
  const trackers = getOwnerContext<OwnerIDTracker[]>(scopeOwner, OWNER_ID_TRACKERS);

  for (const tracker of trackers ?? []) {
    tracker.set(key, Math.max(tracker.get(key) ?? 0, next));
  }

  const reservations = getOwnerContext<OwnerIDReservations>(scopeOwner, OWNER_ID_RESERVATIONS);
  reservations?.set(key, Math.max(reservations.get(key) ?? 0, next));
}

/** Allocate the next numeric child index for an ownerless async resource. */
export function createOwnerIdentityPath(parent = currentOwner): number[] | undefined {
  const identityParent = parent?.identityOwner ?? null;
  const parentPath = getOwnerIdentityPath(identityParent);
  if (!identityParent || !parentPath) return undefined;

  const index = identityParent.nodeCount++;
  recordOwnerIDReservation(parent, identityParent, identityParent.nodeCount);
  return [...parentPath, index];
}

/** Peek at the next numeric child path without consuming its index. */
export function peekOwnerIdentityPath(parent = currentOwner): number[] | undefined {
  const identityParent = parent?.identityOwner ?? null;
  const parentPath = getOwnerIdentityPath(identityParent);
  if (!identityParent || !parentPath) return undefined;

  return [...parentPath, identityParent.nodeCount];
}

/**
 * Commit a tentative numeric child index after an initializer proves async
 * or creates descendants that need a stable owner scope.
 */
export function commitOwnerIdentityTransaction(owner: Owner): number | undefined {
  const transaction = ownerIdentityTransactions.get(owner);
  if (!transaction) return owner.identityIndex;

  const { identityParent, index, candidateIndex } = transaction;
  const parentPath = getOwnerIdentityPath(identityParent);

  if (
    identityParent &&
    parentPath &&
    index !== undefined &&
    candidateIndex !== undefined &&
    identityParent.nodeCount !== index
  ) {
    throw new Error("[vynn]: An owner identity transaction was invalidated before commit.");
  }

  ownerIdentityTransactions.delete(owner);

  if (!identityParent || !parentPath || index === undefined || candidateIndex === undefined) {
    owner.identityOwner = owner;
    return undefined;
  }

  identityParent.nodeCount = index + 1;
  owner.identityIndex = candidateIndex;
  recordOwnerIDReservation(owner.parent, identityParent, identityParent.nodeCount);

  const reservations = owner.parent
    ? getOwnerContext<OwnerIDReservations>(owner.parent, OWNER_ID_RESERVATIONS)
    : undefined;
  const ownerPathKey = getOwnerIdentityPathKey([...parentPath, candidateIndex]);
  owner.nodeCount = reservations?.get(ownerPathKey) ?? owner.nodeCount;
  return candidateIndex;
}

/** Roll back an unused owner identity transaction without consuming its index. */
export function rollbackOwnerIdentityTransaction(owner: Owner): void {
  const transaction = ownerIdentityTransactions.get(owner);
  if (!transaction) return;

  ownerIdentityTransactions.delete(owner);
  owner.identityIndex = undefined;
  owner.identityOwner = transaction.identityParent ?? owner;
}

/** Whether an owner still has an uncommitted identity allocation transaction. */
export function hasOwnerIdentityTransaction(owner: Owner): boolean {
  return ownerIdentityTransactions.has(owner);
}

/**
 * Add an owner-ID tracker to the current owner context. Trackers are inherited
 * as a stack so nested ErrorBoundaries record their own allocations while
 * outer boundaries still account for the complete descendant subtree.
 */
export function enterOwnerIDTracker(tracker: OwnerIDTracker): void {
  const inherited = getContext<OwnerIDTracker[]>(OWNER_ID_TRACKERS) ?? [];
  setContext(OWNER_ID_TRACKERS, [...inherited, tracker]);
}

/**
 * Restore owner-child cursors for descendants skipped by an SSR ErrorBoundary
 * fallback. Reservations are keyed by numeric owner-index paths.
 */
export function reserveOwnerIDReservations(reservations?: Record<string, number>): void {
  if (!reservations) return;

  const registry = getContext<OwnerIDReservations>(OWNER_ID_RESERVATIONS);
  const activeIdentityOwner = currentOwner?.identityOwner ?? null;
  const activePath = getOwnerIdentityPath(activeIdentityOwner);
  const activePathKey = activePath ? getOwnerIdentityPathKey(activePath) : undefined;

  for (const [pathKey, next] of Object.entries(reservations)) {
    if (!Number.isSafeInteger(next) || next < 0) continue;
    const previous = registry?.get(pathKey) ?? 0;
    if (registry && next > previous) registry.set(pathKey, next);

    if (activeIdentityOwner && activePathKey === pathKey && next > activeIdentityOwner.nodeCount) {
      activeIdentityOwner.nodeCount = next;
    }
  }
}

/**
 * Returns the owner currently associated with the executing code.
 *
 * @returns The owner, or null when no owner is active.
 */
export function getOwner(): Owner | null {
  return currentOwner;
}

/**
 * Creates a new owner and optionally attaches it to a parent owner.
 *
 * Identity-bearing owners consume one numeric child index from the nearest
 * identity-bearing parent. Pass { identity: false } for lifecycle-only scopes.
 */
export function createOwner(parent = currentOwner, options: OwnerOptions = {}): Owner {
  const hasIdentity = options.identity !== false;
  const identityParent = parent?.identityOwner ?? null;
  let identityIndex: number | undefined;

  if (hasIdentity) {
    if (parent === null) {
      identityIndex = 0;
    } else if (identityParent) {
      identityIndex = identityParent.nodeCount++;
      recordOwnerIDReservation(parent, identityParent, identityParent.nodeCount);
    }
  }

  const reservations = parent
    ? getOwnerContext<OwnerIDReservations>(parent, OWNER_ID_RESERVATIONS)
    : undefined;

  const owner: Owner = {
    parent,
    children: [],
    cleanups: [],
    mount: [],
    context: new Map<string | symbol, unknown>(),
    identityIndex,
    identityOwner: null,
    nodeCount: 0,
  };

  owner.identityOwner = hasIdentity ? owner : identityParent;

  if (identityIndex !== undefined) {
    const ownerPath = getOwnerIdentityPath(owner);
    if (ownerPath) owner.nodeCount = reservations?.get(getOwnerIdentityPathKey(ownerPath)) ?? 0;
  }

  if (parent === null && hasIdentity) {
    owner.context.set(OWNER_ID_RESERVATIONS, new Map<string, number>());
  }

  parent?.children.push(owner);
  return owner;
}

/**
 * Create an owner with an identity allocation transaction. Descendants can
 * resolve its candidate numeric index while the parent's cursor stays intact.
 */
export function createOwnerIdentityTransaction(parent = currentOwner): Owner {
  const owner = createOwner(parent, { identity: false });
  const identityParent = parent?.identityOwner ?? null;
  const parentPath = getOwnerIdentityPath(identityParent);
  const index =
    identityParent && parentPath && parent !== null ? identityParent.nodeCount : undefined;
  const candidateIndex = index;

  const reservations = parent
    ? getOwnerContext<OwnerIDReservations>(parent, OWNER_ID_RESERVATIONS)
    : undefined;

  owner.identityOwner = owner;
  if (candidateIndex !== undefined && parentPath) {
    const key = getOwnerIdentityPathKey([...parentPath, candidateIndex]);
    owner.nodeCount = reservations?.get(key) ?? 0;
  }

  ownerIdentityTransactions.set(owner, { identityParent, index, candidateIndex });
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
  owner.identityOwner = null;

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
  return getOwnerContext<T>(currentOwner, key);
}
