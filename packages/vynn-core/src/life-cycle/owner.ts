import { getActiveOwner, runWithOwnerExecution } from "./owner-execution";

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

const OWNER_DISPOSE_CALLBACK = Symbol("vynn.owner-dispose-callback");
type OwnerWithDisposeCallback = Owner & {
  [OWNER_DISPOSE_CALLBACK]?: (owner: Owner) => void;
};

/** Registers one shared finalizer for releasing private metadata after disposal. */
export function setOwnerDisposeCallback(
  owner: Owner,
  callback: (owner: Owner) => void,
): void {
  (owner as OwnerWithDisposeCallback)[OWNER_DISPOSE_CALLBACK] = callback;
}

/**
 * Encode one child index for a hierarchical Owner ID. Nonzero indexes use
 * base36 with uppercase width markers. Zero indexes use ".", and runs of
 * three or more zero indexes collapse into "~" plus a width-marked base36
 * count. The count is self-delimiting, so path segments still need no
 * separators.
 */
function encodeOwnerIdentityIndex(index: number): string {
  const value = index.toString(36);
  const width = value.length - 1;
  const marker = width > 0 ? String.fromCharCode(64 + width) : "";

  return marker + value;
}

/** Read a compressed zero run only when its count token reaches the ID end. */
function readTrailingOwnerIDZeroRun(parentID: string): number | undefined {
  const length = parentID.length;

  // The existing width markers make the count token self-delimiting:
  // one base36 digit, or A + 2 digits, B + 3 digits, and so on.
  for (let width = 0; width <= 26; width++) {
    const digitStart = length - (width + 1);
    const markerIndex = digitStart - 1;

    if (markerIndex <= 0) return undefined;

    if (width === 0) {
      if (parentID.charCodeAt(markerIndex) !== 126) continue;
    } else if (
      parentID.charCodeAt(markerIndex) !== 64 + width ||
      parentID.charCodeAt(markerIndex - 1) !== 126
    ) {
      continue;
    }

    for (let index = digitStart; index < length; index++) {
      const code = parentID.charCodeAt(index);
      if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 122))) {
        return undefined;
      }
    }

    const count = Number.parseInt(parentID.slice(digitStart), 36);
    return Number.isSafeInteger(count) && count >= 3 ? count : undefined;
  }

  return undefined;
}

/** Append one identity slot, compressing consecutive zero-valued path segments. */
export function appendOwnerIdentityID(parentID: string, index: number): string {
  if (index !== 0) {
    return parentID + encodeOwnerIdentityIndex(index);
  }

  const zeroRun = readTrailingOwnerIDZeroRun(parentID);

  if (zeroRun !== undefined) {
    const previousCount = encodeOwnerIdentityIndex(zeroRun);
    return (
      parentID.slice(0, -(previousCount.length + 1)) +
      "~" +
      encodeOwnerIdentityIndex(zeroRun + 1)
    );
  }

  let trailingZeros = 0;
  for (
    let cursor = parentID.length - 1;
    cursor >= 0 && parentID.charCodeAt(cursor) === 46;
    cursor--
  ) {
    trailingZeros++;
  }

  if (trailingZeros >= 2) {
    return (
      parentID.slice(0, -trailingZeros) +
      "~" +
      encodeOwnerIdentityIndex(trailingZeros + 1)
    );
  }

  return parentID + ".";
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
  return getActiveOwner();
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
  return runWithOwnerExecution(owner, fn);
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

  const disposeCallback = (owner as OwnerWithDisposeCallback)[OWNER_DISPOSE_CALLBACK];
  if (disposeCallback) {
    delete (owner as OwnerWithDisposeCallback)[OWNER_DISPOSE_CALLBACK];
    try {
      disposeCallback(owner);
    } catch (error) {
      errors.push(error);
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

