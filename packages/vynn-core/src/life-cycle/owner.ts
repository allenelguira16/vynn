export interface Owner {
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  mount: (() => void | (() => void))[];
  disposed?: boolean;
  context: Map<string | symbol, unknown>;
  /** Stable hydration identity for this owner, when it owns an identity slot. */
  id: string | undefined;
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
  candidateID: string | undefined;
};

const ownerIdentityTransactions = new WeakMap<Owner, OwnerIdentityTransaction>();

const OWNER_ID_RESERVATIONS = Symbol("vynn.owner-id-reservations");
const OWNER_ID_TRACKERS = Symbol("vynn.owner-id-trackers");

const ROOT_OWNER_ID = "0";

let currentOwner: Owner | null = null;

/**
 * Encode one child index so hierarchical owner IDs can be concatenated
 * without separators. Single-digit indexes use one character; multi-digit
 * indexes carry a width marker (a=2 digits, b=3 digits, etc.).
 */
function appendOwnerID(parentID: string, index: number): string {
  const value = String(index);
  const width = value.length - 1;
  const marker = width > 0 ? String.fromCharCode(96 + width) : "";

  return parentID + marker + value;
}

function getOwnerContext<T>(owner: Owner | null, key: string | symbol): T | undefined {
  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key) as T;
    }

    owner = owner.parent;
  }

  return undefined;
}

/** Resolve a committed owner ID or the candidate held by its active transaction. */
export function getOwnerIdentityID(owner: Owner | null): string | undefined {
  if (!owner) return undefined;

  return owner.id ?? ownerIdentityTransactions.get(owner)?.candidateID;
}

function recordOwnerIDReservation(
  scopeOwner: Owner | null,
  identityParent: Owner,
  next: number,
): void {
  const id = getOwnerIdentityID(identityParent);
  if (!id) return;

  // Read trackers from the actual owner scope. The identity parent can be
  // above a transparent owner that installed a nested tracker.
  const trackers = getOwnerContext<OwnerIDTracker[]>(scopeOwner, OWNER_ID_TRACKERS);

  for (const tracker of trackers ?? []) {
    tracker.set(id, Math.max(tracker.get(id) ?? 0, next));
  }

  const reservations = getOwnerContext<OwnerIDReservations>(scopeOwner, OWNER_ID_RESERVATIONS);
  reservations?.set(id, Math.max(reservations.get(id) ?? 0, next));
}

/**
 * Allocate one child identity from the nearest identity-bearing owner.
 *
 * This is used by module-level async resources, which have no lifecycle owner
 * at declaration time but can acquire an identity on their first render read.
 */
export function createOwnerID(parent = currentOwner): string | undefined {
  const identityParent = parent?.identityOwner;
  const identityParentID = getOwnerIdentityID(identityParent);

  if (!identityParent || !identityParentID) return undefined;

  const index = identityParent.nodeCount++;
  recordOwnerIDReservation(parent, identityParent, identityParent.nodeCount);

  return appendOwnerID(identityParentID, index);
}

/** Peek at the next child ID without reserving it. */
export function peekOwnerID(parent = currentOwner): string | undefined {
  const identityParent = parent?.identityOwner;
  const identityParentID = getOwnerIdentityID(identityParent);

  if (!identityParent || !identityParentID) return undefined;

  return appendOwnerID(identityParentID, identityParent.nodeCount);
}

/**
 * Commit the identity allocation transaction associated with an owner.
 *
 * A transaction reserves the next identity without advancing its parent's
 * cursor. Committing makes that reservation permanent and records it for SSR
 * hydration and error-boundary recovery.
 */
export function commitOwnerIdentityTransaction(owner: Owner): string | undefined {
  const transaction = ownerIdentityTransactions.get(owner);
  if (!transaction) return owner.id;

  const { identityParent, index, candidateID } = transaction;
  const identityParentID = getOwnerIdentityID(identityParent);

  if (
    identityParent &&
    identityParentID &&
    index !== undefined &&
    candidateID &&
    identityParent.nodeCount !== index
  ) {
    throw new Error("[vynn]: An owner identity transaction was invalidated before commit.");
  }

  ownerIdentityTransactions.delete(owner);

  if (!identityParent || !identityParentID || index === undefined || !candidateID) {
    owner.identityOwner = owner;
    return undefined;
  }

  identityParent.nodeCount = index + 1;
  owner.id = candidateID;
  recordOwnerIDReservation(owner.parent, identityParent, identityParent.nodeCount);

  const reservations = owner.parent
    ? getOwnerContext<OwnerIDReservations>(owner.parent, OWNER_ID_RESERVATIONS)
    : undefined;

  owner.nodeCount = reservations?.get(candidateID) ?? owner.nodeCount;

  return candidateID;
}

/** Roll back an unused owner identity transaction without advancing its parent. */
export function rollbackOwnerIdentityTransaction(owner: Owner): void {
  const transaction = ownerIdentityTransactions.get(owner);
  if (!transaction) return;

  ownerIdentityTransactions.delete(owner);
  owner.id = undefined;
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
 * fallback. Reservations for not-yet-created nested owners remain in the
 * request-local registry and are applied when those owners are created.
 */
export function reserveOwnerIDReservations(reservations?: Record<string, number>): void {
  if (!reservations) return;

  const registry = getContext<OwnerIDReservations>(OWNER_ID_RESERVATIONS);
  const activeIdentityOwner = currentOwner?.identityOwner;
  const activeIdentityOwnerID = getOwnerIdentityID(activeIdentityOwner);

  for (const [id, next] of Object.entries(reservations)) {
    if (!Number.isSafeInteger(next) || next < 0) continue;

    const previous = registry?.get(id) ?? 0;
    if (registry && next > previous) {
      registry.set(id, next);
    }

    if (
      activeIdentityOwner &&
      activeIdentityOwnerID === id &&
      next > activeIdentityOwner.nodeCount
    ) {
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
 * Identity-bearing owners consume one child slot from the nearest
 * identity-bearing parent. A root owner starts the compact owner-ID scope.
 * Pass { identity: false } for lifecycle-only scopes that should not affect
 * hydration identity allocation.
 *
 * @param parent The parent owner, or the current owner when omitted.
 * @param options Owner identity options.
 * @returns The newly created owner.
 */
export function createOwner(parent = currentOwner, options: OwnerOptions = {}): Owner {
  const hasIdentity = options.identity !== false;
  const identityParent = parent?.identityOwner ?? null;
  const identityParentID = getOwnerIdentityID(identityParent);
  let id: string | undefined;

  if (hasIdentity) {
    if (parent === null) {
      id = ROOT_OWNER_ID;
    } else if (identityParent && identityParentID) {
      const index = identityParent.nodeCount++;
      id = appendOwnerID(identityParentID, index);
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
    id,
    identityOwner: null,
    nodeCount: id ? (reservations?.get(id) ?? 0) : 0,
  };

  owner.identityOwner = hasIdentity ? owner : identityParent;

  if (parent === null && hasIdentity) {
    owner.context.set(OWNER_ID_RESERVATIONS, new Map<string, number>());
  }

  parent?.children.push(owner);

  return owner;
}

/**
 * Create an owner with an identity allocation transaction.
 *
 * The candidate ID stays outside the Owner record until commit. Descendants
 * can still resolve it through getOwnerIdentityID() while the parent cursor
 * remains unchanged.
 */
export function createOwnerIdentityTransaction(parent = currentOwner): Owner {
  const owner = createOwner(parent, { identity: false });
  const identityParent = parent?.identityOwner ?? null;
  const identityParentID = getOwnerIdentityID(identityParent);
  const index =
    identityParent && identityParentID && parent !== null ? identityParent.nodeCount : undefined;
  const candidateID =
    identityParentID && index !== undefined ? appendOwnerID(identityParentID, index) : undefined;

  const reservations = parent
    ? getOwnerContext<OwnerIDReservations>(parent, OWNER_ID_RESERVATIONS)
    : undefined;

  owner.identityOwner = owner;
  owner.nodeCount = candidateID ? (reservations?.get(candidateID) ?? 0) : 0;

  ownerIdentityTransactions.set(owner, {
    identityParent,
    index,
    candidateID,
  });

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
