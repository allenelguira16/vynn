import {
  bindRuntimeContext,
} from "../../runtime/context";
import {
  createOwner,
  disposeOwner,
  getOwner,
  runWithOwner,
  type Owner,
} from "../../life-cycle/owner";
import type { Cleanup, RenderScope, RenderScopeState } from "../types";

const CURRENT_RENDER_SCOPE = Symbol.for("vynn.render-new.current-scope.v1");

interface ScopeRecord {
  readonly owner: Owner;
  readonly parent: RenderScope | null;
  readonly children: Set<RenderScope>;
  parentOwnerCleanup?: Cleanup;
  state: RenderScopeState;
}

const records = new WeakMap<RenderScope, ScopeRecord>();

function getRecord(scope: RenderScope): ScopeRecord {
  const record = records.get(scope);

  if (!record) {
    throw new TypeError("[vynn]: Expected a scope created by render_new.");
  }

  return record;
}

function removeFromOwnerCleanups(owner: Owner, cleanup: Cleanup): void {
  const index = owner.cleanups.indexOf(cleanup);
  if (index !== -1) owner.cleanups.splice(index, 1);
}

/**
 * Marks a scope tree as disposed after its backing Owner tree has already
 * been disposed by an ancestor Owner.
 */
function markScopeTreeDisposed(scope: RenderScope): void {
  const record = records.get(scope);
  if (!record || record.state === "disposed") return;

  record.state = "disposed";

  for (const child of record.children) {
    markScopeTreeDisposed(child);
  }

  record.children.clear();

  if (record.parent) {
    records.get(record.parent)?.children.delete(scope);
  }
}

function assertActive(scope: RenderScope, operation: string): ScopeRecord {
  const record = getRecord(scope);

  if (record.owner.disposed && record.state !== "disposed") {
    markScopeTreeDisposed(scope);
  }

  if (record.state !== "active") {
    throw new Error(
      "[vynn]: Cannot " + operation + " a render scope that is " + record.state + ".",
    );
  }

  return record;
}

/**
 * Creates an independent render lifetime.
 *
 * When parent is omitted, the current render scope is used. If there is no
 * current render scope, the new scope inherits the current Vynn Owner, when
 * one exists. Pass null to create a detached root scope.
 *
 * Render scopes use transparent Vynn Owners: they inherit reactive and runtime
 * context, but do not allocate hydration identity slots.
 */
export function createScope(parent?: RenderScope | null): RenderScope {
  const parentScope = parent === undefined ? getCurrentScope() : parent;
  const parentRecord = parentScope ? assertActive(parentScope, "create a child in") : undefined;
  const parentOwner = parentRecord?.owner ?? (parent === null ? null : getOwner());
  const owner = createOwner(parentOwner, { identity: false });

  const record: ScopeRecord = {
    owner,
    parent: parentScope ?? null,
    children: new Set(),
    state: "active",
  };

  let scope!: RenderScope;

  scope = {
    get parent() {
      return record.parent;
    },
    get state() {
      if (record.owner.disposed && record.state !== "disposed") {
        markScopeTreeDisposed(scope);
      }

      return record.state;
    },
    dispose() {
      disposeScope(scope);
    },
  } as unknown as RenderScope;

  records.set(scope, record);
  owner.context.set(CURRENT_RENDER_SCOPE, scope);
  parentScope && parentRecord?.children.add(scope);

  // If an ancestor Owner is disposed directly, its Owner tree disposes this
  // scope's resources first. This hook then synchronizes the renderer scope
  // state with that already-completed disposal.
  if (parentOwner) {
    const parentOwnerCleanup = () => markScopeTreeDisposed(scope);
    record.parentOwnerCleanup = parentOwnerCleanup;
    parentOwner.cleanups.push(parentOwnerCleanup);
  }

  return scope;
}

/**
 * Returns the closest render scope associated with the active Vynn Owner.
 *
 * Walking Owner ancestors means computations and other internal Owners
 * created inside a render scope still resolve to that enclosing scope.
 */
export function getCurrentScope(): RenderScope | null {
  let owner = getOwner();

  while (owner) {
    const scope = owner.context.get(CURRENT_RENDER_SCOPE) as RenderScope | undefined;
    if (scope) return scope;
    owner = owner.parent;
  }

  return null;
}

/**
 * Executes a callback with the scope's Vynn Owner active.
 *
 * The callback may create reactive values, effects, and child render scopes.
 */
export function runWithScope<T>(scope: RenderScope, callback: () => T): T {
  const record = assertActive(scope, "enter");

  return runWithOwner(record.owner, callback);
}

/**
 * Registers cleanup work on the closest active render scope.
 *
 * Cleanups run once during disposal, after child scopes have been disposed.
 * They execute with the owning scope's Vynn Owner active.
 */
export function onScopeDispose(cleanup: Cleanup): void {
  if (typeof cleanup !== "function") {
    throw new TypeError("[vynn]: onScopeDispose() expects a cleanup function.");
  }

  const scope = getCurrentScope();

  if (!scope) {
    throw new Error("[vynn]: onScopeDispose() must be called inside a render scope.");
  }

  const record = assertActive(scope, "register cleanup in");
  const runCleanup = bindRuntimeContext(() => runWithOwner(record.owner, cleanup));

  record.owner.cleanups.push(runCleanup);
}

/**
 * Disposes a scope, its child scopes, and all reactive resources owned by it.
 *
 * Disposal is idempotent. Children are disposed in reverse creation order.
 * All cleanup callbacks are attempted even when one or more throw.
 */
export function disposeScope(scope: RenderScope): void {
  const record = getRecord(scope);

  if (record.state !== "active") return;

  if (record.owner.disposed) {
    markScopeTreeDisposed(scope);
    return;
  }

  record.state = "disposing";
  const errors: unknown[] = [];

  const children = [...record.children].reverse();

  for (const child of children) {
    try {
      disposeScope(child);
    } catch (error) {
      errors.push(error);
    }
  }

  const parentOwner = record.owner.parent;

  if (parentOwner && record.parentOwnerCleanup) {
    removeFromOwnerCleanups(parentOwner, record.parentOwnerCleanup);
    record.parentOwnerCleanup = undefined;
  }

  try {
    disposeOwner(record.owner);
  } catch (error) {
    errors.push(error);
  } finally {
    record.state = "disposed";
    record.children.clear();

    if (record.parent) {
      records.get(record.parent)?.children.delete(scope);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, "[vynn]: Multiple render scope cleanups failed.");
  }
}
