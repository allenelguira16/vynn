import {
  createRuntimeContext,
  getRuntimeContext,
  getRuntimeOwner,
  runWithRuntimeContext,
  runWithRuntimeContextScope,
  setRuntimeOwner,
  type RuntimeContext,
} from "../runtime/context";

const OWNER_RUNTIME_CONTEXT = Symbol("vynn.owner-runtime-context");
const OWNER_CONTEXT_INITIALIZED = Symbol("vynn.owner-context-initialized");

type OwnerRuntimeState = Owner & {
  [OWNER_RUNTIME_CONTEXT]?: RuntimeContext;
};

type RuntimeContextOwnerState = RuntimeContext & {
  [OWNER_CONTEXT_INITIALIZED]?: boolean;
};

export interface Owner {
  parent: Owner | null;
  children?: Owner[];
  cleanups?: (() => void)[];
  mount?: (() => void | (() => void))[];
  disposed?: boolean;
  context?: Map<string | symbol, unknown>;
  /** Stable hydration identity for this owner, when it owns an identity slot. */
  id: string | undefined;
  /** Nearest ancestor (or self) that owns the hydration ID sequence. */
  identityOwner: Owner | null;
  /** Number of identity slots allocated by this owner. */
  nodeCount: number;
}

/** Lazily creates a child list only for owners that actually acquire children. */
export function getOwnerChildren(owner: Owner): Owner[] {
  return (owner.children ??= []);
}

/** Lazily creates a cleanup list only for owners that register cleanup work. */
export function getOwnerCleanups(owner: Owner): (() => void)[] {
  return (owner.cleanups ??= []);
}

/** Lazily creates mount callbacks only for owners that register onMount work. */
export function getOwnerMounts(owner: Owner): (() => void | (() => void))[] {
  return (owner.mount ??= []);
}

/** Lazily creates a context map only for owners that actually provide context. */
export function getOwnerContextMap(owner: Owner): Map<string | symbol, unknown> {
  return (owner.context ??= new Map<string | symbol, unknown>());
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

const ROOT_OWNER_ID = "0";

const ownerIDReservations = new WeakMap<Owner, OwnerIDReservations>();
const ownerIDTrackers = new WeakMap<Owner, OwnerIDTracker[]>();

function isWithinRuntimeContext(
  context: RuntimeContext,
  ancestor: RuntimeContext,
): boolean {
  let current: RuntimeContext | null = context;

  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }

  return false;
}

/**
 * Each Owner retains the runtime context it was created under. This lets
 * lifecycle callbacks re-enter an owner after an unbound async transition
 * without losing the app, route, or boundary context it inherited.
 */
function getOwnerRuntimeContext(owner: Owner): RuntimeContext {
  let context = (owner as OwnerRuntimeState)[OWNER_RUNTIME_CONTEXT];
  if (context) return context;

  const currentContext = getRuntimeContext();
  const parentContext = owner.parent
    ? getOwnerRuntimeContext(owner.parent)
    : undefined;
  const inheritedContext =
    parentContext && isWithinRuntimeContext(currentContext, parentContext)
      ? currentContext
      : parentContext ?? currentContext;

  context = createRuntimeContext(inheritedContext);
  (owner as OwnerRuntimeState)[OWNER_RUNTIME_CONTEXT] = context;
  return context;
}

/**
 * Encode one child index so hierarchical owner IDs can be concatenated
 * without separators. Single-digit indexes use one character; multi-digit
 * indexes carry a width marker (a=2 digits, b=3 digits, etc.).
 */
export function appendOwnerIdentityID(parentID: string, index: number): string {
  const value = String(index);
  const width = value.length - 1;
  const marker = width > 0 ? String.fromCharCode(96 + width) : "";

  return parentID + marker + value;
}

function getOwnerIDReservations(owner: Owner | null): OwnerIDReservations | undefined {
  while (owner) {
    const reservations = ownerIDReservations.get(owner);
    if (reservations) return reservations;
    owner = owner.parent;
  }
  return undefined;
}

function getOwnerIDTrackers(owner: Owner | null): OwnerIDTracker[] | undefined {
  while (owner) {
    const trackers = ownerIDTrackers.get(owner);
    if (trackers) return trackers;
    owner = owner.parent;
  }
  return undefined;
}

/** Resolve an owner's committed hydration identity. */
export function getOwnerIdentityID(owner: Owner | null): string | undefined {
  return owner?.id;
}

/**
 * Reserve the next identity slot under an owner's identity scope without
 * creating a lifecycle Owner. Async resources use these slots so they share
 * deterministic numbering with child Owners and participate in hydration
 * identity reservations.
 */
export function allocateOwnerIdentityID(owner = getOwner()): string | undefined {
  if (!owner) return undefined;

  const identityOwner = owner.identityOwner ?? owner;
  const parentID = getOwnerIdentityID(identityOwner);
  if (parentID === undefined) return undefined;

  const index = identityOwner.nodeCount++;
  recordOwnerIDReservation(owner, identityOwner, identityOwner.nodeCount);

  return appendOwnerIdentityID(parentID, index);
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
  const trackers = getOwnerIDTrackers(scopeOwner);

  for (const tracker of trackers ?? []) {
    tracker.set(id, Math.max(tracker.get(id) ?? 0, next));
  }

  const reservations = getOwnerIDReservations(scopeOwner);
  reservations?.set(id, Math.max(reservations.get(id) ?? 0, next));
}

/**
 * Add an owner-ID tracker to the current owner context. Trackers are inherited
 * as a stack so nested ErrorBoundaries record their own allocations while
 * outer boundaries still account for the complete descendant subtree.
 */
export function enterOwnerIDTracker(tracker: OwnerIDTracker): void {
  const owner = getOwner();
  if (!owner) return;
  const inherited = getOwnerIDTrackers(owner) ?? [];
  ownerIDTrackers.set(owner, [...inherited, tracker]);
}

/**
 * Restore owner-child cursors for descendants skipped by an SSR ErrorBoundary
 * fallback. Reservations for not-yet-created nested owners remain in the
 * request-local registry and are applied when those owners are created.
 */
export function reserveOwnerIDReservations(reservations?: Record<string, number>): void {
  if (!reservations) return;

  const owner = getOwner();
  const registry = getOwnerIDReservations(owner);
  const activeIdentityOwner = owner?.identityOwner ?? null;
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
  return getRuntimeOwner<Owner | null>() ?? null;
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
export function createOwner(parent = getOwner(), options: OwnerOptions = {}): Owner {
  const hasIdentity = options.identity !== false;
  const identityParent = parent?.identityOwner ?? null;
  const identityParentID = getOwnerIdentityID(identityParent);
  let id: string | undefined;

  if (hasIdentity) {
    if (parent === null) {
      id = ROOT_OWNER_ID;
    } else if (identityParent && identityParentID) {
      const index = identityParent.nodeCount++;
      id = appendOwnerIdentityID(identityParentID, index);
      recordOwnerIDReservation(parent, identityParent, identityParent.nodeCount);
    }
  }

  const reservations = getOwnerIDReservations(parent);

  const owner: Owner = {
    parent,
    id,
    identityOwner: null,
    nodeCount: id ? (reservations?.get(id) ?? 0) : 0,
  };

  owner.identityOwner = hasIdentity ? owner : identityParent;

  if (parent === null && hasIdentity) {
    ownerIDReservations.set(owner, new Map<string, number>());
  }

  if (parent) {
    const parentContext = getOwnerRuntimeContext(parent);
    const currentContext = getRuntimeContext();
    const inheritedContext = isWithinRuntimeContext(currentContext, parentContext)
      ? currentContext
      : parentContext;

    (owner as OwnerRuntimeState)[OWNER_RUNTIME_CONTEXT] = createRuntimeContext(inheritedContext);
  }

  if (parent) getOwnerChildren(parent).push(owner);

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
  if (!owner) {
    return runWithRuntimeContextScope(() => {
      setRuntimeOwner(null);
      return fn();
    });
  }

  const ownerContext = getOwnerRuntimeContext(owner);

  // The first activation initializes the persistent frame for this owner.
  // Later activations use a child frame, preserving any explicitly captured
  // descendant context while isolating temporary writes between callbacks.
  const ownerContextState = ownerContext as RuntimeContextOwnerState;
  if (!ownerContextState[OWNER_CONTEXT_INITIALIZED]) {
    ownerContextState[OWNER_CONTEXT_INITIALIZED] = true;

    return runWithRuntimeContext(ownerContext, () => {
      setRuntimeOwner(owner);
      return fn();
    });
  }

  const activeContext = getRuntimeContext();
  const parentContext = isWithinRuntimeContext(activeContext, ownerContext)
    ? activeContext
    : ownerContext;

  return runWithRuntimeContext(parentContext, () =>
    runWithRuntimeContextScope(() => {
      setRuntimeOwner(owner);
      return fn();
    }),
  );
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

  // Child disposal unlinks each child from this array. Walking from the end
  // avoids allocating a copy of the whole child list.
  const children = owner.children;
  if (children) {
    while (children.length > 0) {
      const child = children[children.length - 1];
      try {
        disposeOwner(child);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  // Detach the list before running callbacks, matching splice(0)'s behavior:
  // cleanup work registered by a cleanup is not part of this disposal pass.
  const cleanups = owner.cleanups;
  owner.cleanups = undefined;
  if (cleanups) {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
  }

  const parent = owner.parent;
  if (parent?.children) {
    const index = parent.children.indexOf(owner);
    if (index !== -1) parent.children.splice(index, 1);
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

