import { ASYNC_DATA_SSR_KEY } from "../const";
import {
  getContext,
  getOwner,
  getOwnerBoundaryHandler,
  setContext,
  setOwnerBoundaryHandler,
  type Owner,
} from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_ID = Symbol("vynn.async-id");
const ASYNC_VALUES = Symbol("vynn.async-values");

type AsyncIdScope = {
  prefix: string;
  owner: Owner;
};

export type AsyncHydrationValue<T = unknown> = {
  found: boolean;
  value: T | undefined;
};

export function isInsideAwaitBoundary(): boolean {
  return getOwnerBoundaryHandler("onPending") !== undefined;
}

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getOwnerBoundaryHandler("onPending") as AsyncBoundary<T> | undefined;
}

/**
 * Installs a pending handler on the current owner. Descendant resources find
 * it through owner ancestry, without a separate async-boundary context value.
 */
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setOwnerBoundaryHandler("onPending", boundary as (promise: Promise<unknown>) => void);
}

export function initializeAsyncContext(): void {
  const owner = getOwner();
  if (!owner) return;

  setContext<AsyncIdScope>(ASYNC_ID, {
    prefix: "root",
    owner,
  });
  setContext<Record<string, unknown>>(ASYNC_VALUES, Object.create(null));
}

/**
 * Give each lazy instance an independent resource-ID prefix.
 *
 * Descendant resources inherit the prefix, while nested lazy instances use
 * their own prefix. Their local IDs are assigned by their component owners.
 */
export function initializeLazyAsyncScope(lazyID: string): void {
  const owner = getOwner();
  if (!owner) return;

  setContext<AsyncIdScope>(ASYNC_ID, {
    prefix: `lazy:${lazyID}`,
    owner,
  });
}

/**
 * Returns a component-scoped async hydration ID.
 *
 * The resource index belongs to the nearest component owner, so resources
 * created in a skipped subtree cannot shift IDs belonging to sibling
 * components. Resources created without an owner skip SSR serialization.
 */
export function getAsyncIDIfAvailable(): string | undefined {
  const scope = getContext<AsyncIdScope>(ASYNC_ID);
  if (!scope) return undefined;

  // Resource identity is local to the owning component. A skipped or failed
  // sibling subtree therefore cannot shift the IDs assigned to later
  // resources during hydration.
  let componentOwner = getOwner();

  while (componentOwner && componentOwner.componentID === undefined) {
    componentOwner = componentOwner.parent;
  }

  // Only use a descendant component owner as the resource counter. If the
  // current owner is the lazy scope owner itself (or an ordinary owner inside
  // that scope), keep the counter local to the scope instead.
  let resourceOwner = scope.owner;

  if (componentOwner && componentOwner !== scope.owner) {
    let ancestor: Owner | null = componentOwner;

    while (ancestor && ancestor !== scope.owner) {
      ancestor = ancestor.parent;
    }

    if (ancestor === scope.owner) {
      resourceOwner = componentOwner;
    }
  }

  let identityOwner: Owner | null = resourceOwner;

  while (identityOwner && identityOwner.componentID === undefined) {
    identityOwner = identityOwner.parent;
  }

  const resourceIndex = resourceOwner.nextAsyncResourceID ?? 0;
  resourceOwner.nextAsyncResourceID = resourceIndex + 1;

  return `${scope.prefix}:${identityOwner?.componentID ?? "root"}:${resourceIndex}`;
}

/**
 * Returns the next async hydration ID.
 *
 * Use this when an async ID is required by the caller. Async resource
 * primitives should use getAsyncIDIfAvailable() so they can also be created
 * outside a component or initialized render context.
 */
export function getAsyncID(): string {
  const asyncID = getAsyncIDIfAvailable();

  if (asyncID === undefined) {
    throw new Error(
      "[vynn]: initializeAsyncContext is not yet initialized, run it first before using getAsyncID",
    );
  }

  return asyncID;
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getContext<Record<string, unknown>>(ASYNC_VALUES);
}

/**
 * Read one serialized result without confusing a valid falsy value with a
 * missing entry. The key is consumed once so later async instances cannot
 * accidentally reuse it.
 */
export function getAsyncValue<T = unknown>(asyncID: string): AsyncHydrationValue<T> {
  if (isServer()) {
    return { found: false, value: undefined };
  }

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY] as
    | Record<string, unknown>
    | undefined;

  if (!values || !Object.prototype.hasOwnProperty.call(values, asyncID)) {
    return { found: false, value: undefined };
  }

  const encodedValue = values[asyncID];
  delete values[asyncID];

  return {
    found: true,
    value: deserializeServerFunctionValue(encodedValue) as T,
  };
}
