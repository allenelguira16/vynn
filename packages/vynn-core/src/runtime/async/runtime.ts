import { ASYNC_DATA_SSR_KEY } from "../../const";
import {
  allocateOwnerIdentityID,
  appendOwnerIdentityID,
  getOwner,
  getOwnerIdentityID,
  type Owner,
} from "../../life-cycle/owner";
import {
  getContext,
  runWithRuntimeContextScope,
  setContext,
} from "../context";

export type ResourceValue<T = unknown> = {
  found: boolean;
  value: T | undefined;
};

type AsyncRuntime = {
  values: Record<string, unknown>;
  hydrationValues: Record<string, unknown>;
  resourceIDs: WeakMap<object, string>;
};

type ResourceScope = {
  runtime: AsyncRuntime;
  id: string;
  next: number;
};

const runtimes = new WeakMap<Owner, AsyncRuntime>();
const ASYNC_RESOURCE_READ_OWNER = Symbol("vynn.async-resource-read-owner");
let activeScope: ResourceScope | undefined;
let deserialize: ((value: unknown) => unknown) | undefined;
let hydrationProbe: (<T>(callback: () => T) => T) | undefined;


/**
 * Resolve the Owner used only to associate nested async resource reads with
 * the active render root. Computation execution may still run with no
 * lifecycle Owner.
 */
export function getAsyncResourceReadOwner(): Owner | null {
  const owner = getContext<Owner | null>(ASYNC_RESOURCE_READ_OWNER);
  return owner === undefined ? getOwner() : owner;
}

/**
 * Preserve a render root while an owner-independent derived computation runs.
 * The runtime context keeps concurrent SSR requests isolated and allows nested
 * computations to inherit the same resource-read identity without restoring
 * their lifecycle Owner.
 */
export function withAsyncResourceReadOwner<T>(
  owner: Owner | null,
  callback: () => T,
): T {
  return runWithRuntimeContextScope(() => {
    const inherited = getContext<Owner | null>(ASYNC_RESOURCE_READ_OWNER);
    setContext(
      ASYNC_RESOURCE_READ_OWNER,
      owner ?? (inherited === undefined ? getOwner() : inherited),
    );

    return callback();
  });
}

function getRootOwner(owner: Owner | null): Owner | undefined {
  if (!owner) return undefined;

  let root = owner;
  while (root.parent) root = root.parent;
  return root;
}

function readHydrationPayload(): Record<string, unknown> {
  if (import.meta.env.SSR || typeof window === "undefined") return Object.create(null);

  const payload = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  return payload !== null && typeof payload === "object"
    ? payload as Record<string, unknown>
    : Object.create(null);
}

function ensureRuntime(owner = getOwner()): AsyncRuntime | undefined {
  const root = getRootOwner(owner);
  if (!root) return undefined;

  let runtime = runtimes.get(root);
  if (!runtime) {
    runtime = {
      values: Object.create(null),
      hydrationValues: Object.create(null),
      resourceIDs: new WeakMap(),
    };
    runtimes.set(root, runtime);
  }

  return runtime;
}

/** Start one request-local resource registry for the current render root. */
export function initializeAsyncRuntime(): void {
  const root = getRootOwner(getOwner());
  if (!root) return;

  const hydrationValues = readHydrationPayload();
  runtimes.set(root, {
    values: Object.create(null),
    hydrationValues,
    resourceIDs: new WeakMap(),
  });
}

/** Install the async hydration decoder in client hydration entry points. */
export function setAsyncValueDeserializer(
  decoder: (value: unknown) => unknown,
): void {
  deserialize = decoder;
}

/** Install the fake-async probe only in SSR and hydration entry points. */
export function setAsyncHydrationProbe(
  probe: <T>(callback: () => T) => T,
): void {
  hydrationProbe = probe;
}

export function withAsyncHydrationProbe<T>(callback: () => T): T {
  return hydrationProbe ? hydrationProbe(callback) : callback();
}

/**
 * Allocate a deterministic resource identity slot without creating an Owner.
 * Nested resources use the parent resource's local child-index sequence.
 */
export function allocateAsyncResourceID(owner = getOwner()): string | undefined {
  const runtime = ensureRuntime(owner);
  if (!owner || !runtime) return undefined;

  if (activeScope?.runtime === runtime) {
    return appendOwnerIdentityID(activeScope.id, activeScope.next++);
  }

  return allocateOwnerIdentityID(owner);
}

/** Peek at the next resource identity without reserving its slot. */
export function peekAsyncResourceID(owner = getOwner()): string | undefined {
  const runtime = ensureRuntime(owner);
  if (!owner || !runtime) return undefined;

  if (activeScope?.runtime === runtime) {
    return appendOwnerIdentityID(activeScope.id, activeScope.next);
  }

  const identityOwner = owner.identityOwner ?? owner;
  const identityID = getOwnerIdentityID(identityOwner);
  return identityID === undefined
    ? undefined
    : appendOwnerIdentityID(identityID, identityOwner.nodeCount);
}

/**
 * Get a stable resource identity for an owner-independent reactive value.
 *
 * The mapping belongs to the render-root runtime so a module-level singleton
 * can be consumed by separate SSR requests without retaining one request's
 * Owner or resource ID on the shared reactive object.
 */
export function allocateAsyncResourceIDFor(
  resource: object,
  owner = getOwner(),
): string | undefined {
  const runtime = ensureRuntime(owner);
  if (!owner || !runtime) return undefined;

  const existing = runtime.resourceIDs.get(resource);
  if (existing !== undefined) return existing;

  const resourceID = allocateAsyncResourceID(owner);
  if (resourceID !== undefined) runtime.resourceIDs.set(resource, resourceID);
  return resourceID;
}

/** Give resources created inside an initializer a stable nested index scope. */
export function withAsyncResourceScope<T>(
  resourceID: string | undefined,
  callback: () => T,
): T {
  const runtime = ensureRuntime();
  if (!runtime || resourceID === undefined) return callback();

  const previous = activeScope;
  activeScope = { runtime, id: resourceID, next: 0 };

  try {
    return callback();
  } finally {
    activeScope = previous;
  }
}

export function hasAsyncResourceValue(resourceID: string | undefined, owner = getOwner()): boolean {
  if (import.meta.env.SSR || resourceID === undefined) return false;
  const runtime = ensureRuntime(owner);
  return !!runtime && Object.prototype.hasOwnProperty.call(
    runtime.hydrationValues,
    resourceID,
  );
}

/** Consume one hydrated resource value. Falsy values are valid payloads. */
export function readAsyncResourceValue<T = unknown>(
  resourceID: string | undefined,
  owner = getOwner(),
): ResourceValue<T> {
  if (import.meta.env.SSR || resourceID === undefined) {
    return { found: false, value: undefined };
  }

  const runtime = ensureRuntime(owner);
  if (!runtime || !Object.prototype.hasOwnProperty.call(runtime.hydrationValues, resourceID)) {
    return { found: false, value: undefined };
  }

  const encoded = runtime.hydrationValues[resourceID];
  delete runtime.hydrationValues[resourceID];

  return {
    found: true,
    value: (deserialize ? deserialize(encoded) : encoded) as T,
  };
}

export function writeAsyncResourceValue(
  resourceID: string | undefined,
  value: unknown,
  owner = getOwner(),
): void {
  if (!import.meta.env.SSR || resourceID === undefined) return;
  const runtime = ensureRuntime(owner);
  if (runtime) runtime.values[resourceID] = value;
}

export function getAsyncResourceValues(owner = getOwner()): Record<string, unknown> | undefined {
  return ensureRuntime(owner)?.values;
}
