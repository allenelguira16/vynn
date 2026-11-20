import { enterAsyncBoundary } from "./async-context";
import {
  enterErrorBoundary,
  getErrorBoundary,
  getErrorBoundaryValues,
} from "./error-boundary-context";
import {
  createOwner,
  disposeOwner,
  getContext,
  getOwner,
  runWithOwner,
  setContext,
} from "../life-cycle/owner";
import type { Owner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity/not-ready-error";
import type { RenderMode } from "./render-mode";

export type SsrBoundaryCancellation = {
  cancelPromise: Promise<void>;
  cancel: () => void;
};

export function createSsrBoundaryCancellation(): SsrBoundaryCancellation {
  let resolve!: () => void;
  const cancelPromise = new Promise<void>((done) => {
    resolve = done;
  });
  return { cancelPromise, cancel: resolve };
}

export type SsrStringDynamicSlot = {
  id: number;
  kind: "child" | "attribute";
  owner: Owner;
  render: () => unknown;
  promises: Set<Promise<unknown>>;
  marker?: string;
  errorBoundary?: (error: Error) => void;
};

export type SsrStringBoundary = {
  id: number;
  kind: "root" | "await" | "lazy";
  owner: Owner;
  render: () => unknown;
  fallback: () => unknown;
  fallbackKey: object;
  componentKey?: unknown;
  parent?: SsrStringBoundary;
  children: Set<SsrStringBoundary>;
  cancelPromise: Promise<void>;
  cancel: () => void;
  cancelled: boolean;
  promises: Set<Promise<unknown>>;
  slots: SsrStringDynamicSlot[];
  nextSlotId: number;
  content: string;
  requiresRerender: boolean;
  errorBoundary?: (error: Error) => void;
  catchBoundary?: SsrStringErrorBoundary;
  active: boolean;
  version: number;
};

export type SsrStringErrorBoundary = {
  id: number;
  owner: Owner;
  fallback?: (error: Error, reset: () => void) => unknown;
  fallbackKey: object;
  error?: Error;
  boundaries: Set<SsrStringBoundary>;
  handler: (error: Error) => void;
};

type ComponentSlot = {
  component: Function;
  owner: Owner;
};

export type SsrStringRenderState = {
  mode: RenderMode;
  nextBoundaryId: number;
  boundaries: SsrStringBoundary[];
  awaitBoundaries: WeakMap<Owner, SsrStringBoundary>;
  errorBoundaries: Map<number, SsrStringErrorBoundary>;
  errorBoundariesByOwner: WeakMap<Owner, SsrStringErrorBoundary>;
  errorBoundaryIds: WeakMap<Owner, number>;
  errorHandlers: WeakMap<(error: Error) => void, SsrStringErrorBoundary>;
  componentOwners: WeakMap<Owner, Map<unknown, ComponentSlot[]>>;
  activeComponentPass: { key: unknown; cursors: Map<Owner, number> } | null;
  rootBoundary?: SsrStringBoundary;
};

const SSR_STRING_CONTEXT = Symbol.for("vynn.ssr-string-render.v1");
const SSR_DYNAMIC_BOUNDARY = Symbol.for("vynn.ssr-dynamic-boundary.v1");
const SSR_CHILDREN = "__vynn_ssr_children_v1__" as const;

export type SsrChildren = (() => unknown) & {
  [SSR_CHILDREN]: true;
};

/**
 * Defer a component's children until its consumer renders them.
 *
 * Capture the current owner at the point the component reads its children
 * prop. The thunk may be returned from that component and evaluated after its
 * owner scope has otherwise been restored.
 */
function isOwnerWithin(owner: Owner | null, ancestor: Owner | null): boolean {
  if (!ancestor) return true;

  let current = owner;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }

  return false;
}

export function createSsrChildren(render: () => unknown): SsrChildren {
  const owner = getOwner();
  const children = (() => {
    const activeOwner = getOwner();
    const renderOwner = isOwnerWithin(activeOwner, owner) ? activeOwner : owner;
    return runWithOwner(renderOwner, render);
  }) as SsrChildren;
  Object.defineProperty(children, SSR_CHILDREN, { value: true });
  return children;
}

export function isSsrChildren(value: unknown): value is SsrChildren {
  return (
    typeof value === "function" &&
    (value as SsrChildren)[SSR_CHILDREN] === true
  );
}

export function initializeSsrStringContext(mode: RenderMode): SsrStringRenderState {
  const state: SsrStringRenderState = {
    mode,
    nextBoundaryId: 0,
    boundaries: [],
    awaitBoundaries: new WeakMap(),
    errorBoundaries: new Map(),
    errorBoundariesByOwner: new WeakMap(),
    errorBoundaryIds: new WeakMap(),
    errorHandlers: new WeakMap(),
    componentOwners: new WeakMap(),
    activeComponentPass: null,
  };
  setContext(SSR_STRING_CONTEXT, state);
  return state;
}

export function getSsrStringContext(): SsrStringRenderState | undefined {
  return getOwner() ? getContext<SsrStringRenderState>(SSR_STRING_CONTEXT) : undefined;
}

export function isSsrStringRendering(): boolean {
  return getSsrStringContext() !== undefined;
}

/** Allocate one hydration-stable Catch ID per component owner, including retries. */
export function getSsrErrorBoundaryID(owner: Owner, allocate: () => number): number {
  const state = getSsrStringContext();
  if (!state) return allocate();

  const existing = state.errorBoundaryIds.get(owner);
  if (existing !== undefined) return existing;

  const id = allocate();
  state.errorBoundaryIds.set(owner, id);
  return id;
}

/**
 * Reuses the component owner at a stable parent/call-position pair during
 * retries. Each render pass has its own owner slots so fallback trees do not
 * overwrite the owners created by suspended children.
 */
export function createSsrComponentOwner(component: Function): Owner {
  const parent = getOwner();
  const state = getSsrStringContext();
  if (!parent || !state) return createOwner(parent);

  const pass = state.activeComponentPass;
  if (!pass) return createOwner(parent);

  const index = pass.cursors.get(parent) ?? 0;
  pass.cursors.set(parent, index + 1);

  let ownerScopes = state.componentOwners.get(parent);
  if (!ownerScopes) {
    ownerScopes = new Map();
    state.componentOwners.set(parent, ownerScopes);
  }

  let slots = ownerScopes.get(pass.key);
  if (!slots) {
    slots = [];
    ownerScopes.set(pass.key, slots);
  }

  const existing = slots[index];
  if (existing?.component === component && !existing.owner.disposed) {
    return existing.owner;
  }

  if (existing && !existing.owner.disposed) {
    disposeOwner(existing.owner);
  }

  const owner = createOwner(parent);
  slots[index] = { component, owner };
  return owner;
}

export function runWithSsrComponentPass<T>(callback: () => T, key: unknown = callback): T {
  const state = getSsrStringContext();
  if (!state) return callback();

  const previous = state.activeComponentPass;
  state.activeComponentPass = { key, cursors: new Map() };
  try {
    return callback();
  } finally {
    state.activeComponentPass = previous;
  }
}

/** Run a string-rendering component under a stable owner and call-position scope. */
export function renderSsrComponent<T>(
  owner: Owner,
  callback: () => T,
  key: unknown = callback,
): T {
  return runWithOwner(owner, () => runWithSsrComponentPass(callback, key));
}

/**
 * Evaluate Await children once and register a retryable string boundary when a
 * resource suspends. The component itself remains an ordinary component call.
 */
export function renderSsrAwait(
  render: () => unknown,
  fallback: () => unknown,
  options: {
    kind?: "await" | "lazy";
    bubblePromise?: Promise<unknown>;
  } = {},
): string {
  const state = getSsrStringContext();
  const owner = getOwner();
  if (!state || !owner) {
    throw new Error("[Vynn SSR] Await requires an active string SSR render.");
  }

  const parentBoundary = getContext<SsrStringBoundary>(SSR_DYNAMIC_BOUNDARY);
  let boundary = state.awaitBoundaries.get(owner);
  if (!boundary) {
    boundary = {
      id: state.nextBoundaryId++,
      kind: options.kind ?? "await",
      owner,
      render,
      fallback,
      fallbackKey: {},
      parent: parentBoundary,
      children: new Set(),
      ...createSsrBoundaryCancellation(),
      cancelled: false,
      promises: new Set(),
      slots: [],
      nextSlotId: 0,
      content: "",
      requiresRerender: false,
      active: false,
      version: 0,
    };
    state.awaitBoundaries.set(owner, boundary);
    state.boundaries.push(boundary);
  }

  boundary.kind = options.kind ?? "await";
  boundary.render = render;
  boundary.fallback = fallback;
  const activeErrorHandler = getErrorBoundary();
  const catchBoundary = activeErrorHandler
    ? state.errorHandlers.get(activeErrorHandler)
    : undefined;
  if (boundary.catchBoundary && boundary.catchBoundary !== catchBoundary) {
    boundary.catchBoundary.boundaries.delete(boundary);
  }
  boundary.catchBoundary = catchBoundary;
  catchBoundary?.boundaries.add(boundary);
  if (boundary.parent && boundary.parent !== parentBoundary) {
    boundary.parent.children.delete(boundary);
  }
  boundary.parent = parentBoundary;
  parentBoundary?.children.add(boundary);
  const cancellation = createSsrBoundaryCancellation();
  boundary.cancelPromise = cancellation.cancelPromise;
  boundary.cancel = cancellation.cancel;
  boundary.cancelled = false;
  boundary.errorBoundary = getErrorBoundary();

  let rendered: string | undefined;
  try {
    rendered = renderSsrBoundaryContent(boundary);
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;
    boundary.promises.add(error.promise);
    boundary.requiresRerender = true;
  }

  if (options.bubblePromise) {
    let parent = parentBoundary;
    while (parent && parent.kind !== "await") {
      parent = parent.parent;
    }

    if (parent) {
      // Let the nearest authored Await own the lazy module's initial fallback.
      // The lazy boundary remains nested so its loaded subtree can register
      // independent child boundaries and stream them after this parent patch.
      parent.promises.add(options.bubblePromise);
      parent.requiresRerender = true;
    }
  }

  if (boundary.promises.size === 0) {
    boundary.active = false;
    const content = rendered ?? boundary.content;
    return boundary.kind === "await"
      ? "<!--vynn-await:resolved-->" + content
      : content;
  }

  // The fallback has a child owner with an isolated async/dynamic context.
  // This prevents it from replacing the Await owner's boundary for later work.
  const fallbackOwner = createOwner(owner, { identity: false });
  let fallbackHtml: string;
  try {
    fallbackHtml = runWithOwner(fallbackOwner, () => {
      setContext(SSR_DYNAMIC_BOUNDARY, undefined);
      enterAsyncBoundary(() => undefined);
      return normalizeSsrResult(
        renderSsrComponent(fallbackOwner, fallback, boundary.fallbackKey),
      );
    });
  } finally {
    disposeOwner(fallbackOwner);
  }

  const fallbackContent =
    boundary.kind === "await"
      ? "<!--vynn-await:fallback-->" + fallbackHtml
      : fallbackHtml;

  if (state.mode === "sync") {
    boundary.active = false;
    return fallbackContent;
  }

  boundary.active = true;
  boundary.version++;
  return `<!--vynn-ssr-start:${boundary.id}-->${fallbackContent}<!--vynn-ssr-end:${boundary.id}-->`;
}

function cancelSsrBoundaryTree(boundary: SsrStringBoundary): void {
  boundary.cancelled = true;
  boundary.cancel();
  boundary.active = false;
  for (const child of boundary.children) cancelSsrBoundaryTree(child);
}

/**
 * Render a boundary's children under its own async/dynamic context. Dynamic
 * JSX expressions register independent getter slots; only direct suspension
 * escaping the component body requires a component-level retry.
 */

export function renderSsrBoundaryContent(boundary: SsrStringBoundary): string {
  for (const child of boundary.children) cancelSsrBoundaryTree(child);
  boundary.children.clear();
  boundary.promises.clear();
  boundary.slots = [];
  boundary.nextSlotId = 0;
  boundary.content = "";
  boundary.requiresRerender = false;

  return runWithOwner(boundary.owner, () => {
    setContext(SSR_DYNAMIC_BOUNDARY, boundary);
    enterAsyncBoundary((promise) => boundary.promises.add(promise));

    try {
      const rendered = renderSsrComponent(
        boundary.owner,
        boundary.render,
        boundary.componentKey ?? boundary,
      );
      boundary.content = normalizeSsrResult(rendered);
      return boundary.content;
    } catch (error) {
      if (error instanceof NotReadyError) {
        boundary.promises.add(error.promise);
        boundary.requiresRerender = true;
      }
      throw error;
    }
  });
}

/**
 * Evaluate a compiler-generated dynamic JSX expression. If it suspends, retain
 * only this getter so the component and its local resources are not recreated.
 */
export function renderSsrDynamicChild(render: () => unknown): string {
  try {
    return normalizeSsrResult(render());
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;

    const owner = getOwner();
    const boundary = getContext<SsrStringBoundary>(SSR_DYNAMIC_BOUNDARY);
    if (!owner || !boundary) throw error;

    boundary.promises.add(error.promise);
    if (getSsrStringContext()?.mode === "sync") return "";

    const slot: SsrStringDynamicSlot = {
      id: boundary.nextSlotId++,
      kind: "child",
      owner,
      render,
      promises: new Set([error.promise]),
      errorBoundary: getErrorBoundary(),
    };
    boundary.slots.push(slot);

    return "<!--vynn-ssr-slot-start:" + boundary.id + ":" + slot.id +
      "--><!--vynn-ssr-slot-end:" + boundary.id + ":" + slot.id + "-->";
  }
}

/**
 * Evaluate a dynamic attribute getter without ever placing a comment inside a
 * start tag. Pending attributes receive a unique inert data attribute that the
 * string renderer replaces before producing the resolved boundary patch.
 */
export function renderSsrDynamicAttribute(render: () => unknown): string {
  try {
    return normalizeSsrResult(render());
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;

    const owner = getOwner();
    const boundary = getContext<SsrStringBoundary>(SSR_DYNAMIC_BOUNDARY);
    if (!owner || !boundary) throw error;

    boundary.promises.add(error.promise);
    if (getSsrStringContext()?.mode === "sync") return "";

    const id = boundary.nextSlotId++;
    const marker = " data-vynn-ssr-pending-attr-" + id + "=\"" + boundary.id + ":" + id + "\"";
    const slot: SsrStringDynamicSlot = {
      id,
      kind: "attribute",
      owner,
      render,
      promises: new Set([error.promise]),
      marker,
      errorBoundary: getErrorBoundary(),
    };
    boundary.slots.push(slot);
    return marker;
  }
}

/** Register a Catch component as a render-time error boundary. */
export function renderSsrCatch(
  id: number,
  render: () => unknown,
  fallback?: (error: Error, reset: () => void) => unknown,
): string {
  const state = getSsrStringContext();
  const owner = getOwner();
  if (!state || !owner) {
    throw new Error("[Vynn SSR] Catch requires an active string SSR render.");
  }

  let record = state.errorBoundariesByOwner.get(owner);
  if (!record) {
    const created: SsrStringErrorBoundary = {
      id,
      owner,
      fallback,
      fallbackKey: {},
      boundaries: new Set(),
      handler(error) {
        created.error = error;
        const values = getErrorBoundaryValues();
        if (values) {
          values[id] = { status: "fallback", name: error.name, message: error.message };
        }
      },
    };
    record = created;
    state.errorBoundariesByOwner.set(owner, record);
    state.errorHandlers.set(record.handler, record);
  }

  record.fallback = fallback;
  record.error = undefined;
  record.boundaries.clear();
  state.errorBoundaries.set(record.id, record);
  enterErrorBoundary(record.handler);

  const values = getErrorBoundaryValues();
  if (values) values[record.id] = { status: "children" };

  let html: string;
  try {
    html = normalizeSsrResult(renderSsrComponent(owner, render, record));
  } catch (error) {
    if (error instanceof NotReadyError) throw error;
    if (!(error instanceof Error)) throw error;
    record.handler(error);
    cancelSsrErrorBoundaryBoundaries(record);
    html = renderSsrErrorFallback(record);
  }

  return `<!--vynn-ssr-error-start:${record.id}-->${html}<!--vynn-ssr-error-end:${record.id}-->`;
}

export function getSsrErrorBoundary(
  handler: ((error: Error) => void) | undefined,
): SsrStringErrorBoundary | undefined {
  const state = getSsrStringContext();
  return handler ? state?.errorHandlers.get(handler) : undefined;
}

export function cancelSsrErrorBoundaryBoundaries(
  record: SsrStringErrorBoundary,
): void {
  for (const boundary of record.boundaries) cancelSsrBoundaryTree(boundary);
}

export function renderSsrErrorFallback(record: SsrStringErrorBoundary): string {
  if (!record.error) return "";
  if (!record.fallback) throw record.error;

  const fallbackOwner = createOwner(record.owner, { identity: false });
  try {
    return runWithOwner(fallbackOwner, () => {
      setContext(SSR_DYNAMIC_BOUNDARY, undefined);
      enterAsyncBoundary(() => undefined);
      return normalizeSsrResult(
        runWithSsrComponentPass(
          () => record.fallback!(record.error!, () => undefined),
          record.fallbackKey,
        ),
      );
    });
  } finally {
    disposeOwner(fallbackOwner);
  }
}

export function replaceSsrMarkerRange(
  html: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): string {
  const start = html.indexOf(startMarker);
  if (start === -1) return html;
  const contentStart = start + startMarker.length;
  const end = html.indexOf(endMarker, contentStart);
  if (end === -1) return html;
  return html.slice(0, start) + replacement + html.slice(end + endMarker.length);
}

export function normalizeSsrResult(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (isSsrChildren(value)) return normalizeSsrResult(value());
  if (Array.isArray(value)) return value.map(normalizeSsrResult).join("");
  return String(value);
}
