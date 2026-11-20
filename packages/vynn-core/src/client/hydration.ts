import {
  AWAIT_FALLBACK_SSR_MARKER,
  AWAIT_RESOLVED_SSR_MARKER,
  EMPTY_TEXT_SSR_MARKER,
  INTERNAL_RANGE_END_MARKER,
  INTERNAL_RANGE_START_MARKER,
  LAZY_END_SSR_MARKER,
  LAZY_START_SSR_MARKER,
  RAW_HTML_SSR_ATTRIBUTE,
  TEXT_SSR_SEPARATOR,
} from "../const";
import { isServer } from "../context/is-server-context";
import { removeInternalRangeMarkers } from "../dom/internal-range";
import {
  type Owner,
  createOwner,
  getContext,
  getOwner,
  runWithOwner,
  setContext,
} from "../life-cycle/owner";

let serverRenderedElements: Element[] = [];
let serverRenderedTexts: Text[] = [];
let serverRenderedAwaitStates: HydrationAwaitState[] = [];
let serverRenderedLazy = new Map<string, LazyHydrationNodes>();
let serverRenderedRootLazyIDs: string[] = [];

let hydrationElementIndex = 0;
let hydrationTextIndex = 0;
let hydrationAwaitIndex = 0;
let rootLazyHydrationIndex = 0;
const serverLazyIDsByOwner = new WeakMap<Owner, string>();
let rootHydrationDepth = 0;

const LAZY_HYDRATION = Symbol("vynn.lazy-hydration");

// Lazy boundaries discovered in the server-rendered HTML.
let pendingLazyHydration = new Set<string>();

type AfterHydrationTask = {
  callback: () => unknown;
  owner: Owner | null;
  waitForLazy: boolean;
};

type HydrationAwaitState = "resolved" | "fallback";

export type HydrationClaimSnapshot = {
  scope: LazyHydrationNodes | undefined;
  elementIndex: number;
  textIndex: number;
  awaitIndex: number;
};

const afterHydrationTasks = new Set<AfterHydrationTask>();
let hydrationCheckScheduled = false;

export function withHydration(callback: () => void, root: Node) {
  [
    serverRenderedElements,
    serverRenderedTexts,
    serverRenderedAwaitStates,
    serverRenderedLazy,
    serverRenderedRootLazyIDs,
  ] = getServerRenderedNodes(root);

  hydrationElementIndex = 0;
  hydrationTextIndex = 0;
  hydrationAwaitIndex = 0;
  rootLazyHydrationIndex = 0;

  pendingLazyHydration = new Set(serverRenderedLazy.keys());

  rootHydrationDepth++;

  try {
    callback();
  } finally {
    rootHydrationDepth = Math.max(0, rootHydrationDepth - 1);
    scheduleAfterHydrationCheck();
  }
}

function hasUnclaimedHydrationNodes(): boolean {
  return (
    hydrationElementIndex < serverRenderedElements.length ||
    hydrationTextIndex < serverRenderedTexts.length ||
    hydrationAwaitIndex < serverRenderedAwaitStates.length
  );
}

/**
 * Returns whether the current render belongs to an initial hydration pass.
 *
 * Lazy components use their own scope so unrelated pending lazy boundaries
 * cannot make later client-side updates look like hydration work.
 */
export function isHydrationClaimActive(): boolean {
  const scope = getContext<LazyHydrationNodes>(LAZY_HYDRATION);

  return scope ? scope.hydrating : rootHydrationDepth > 0;
}

/**
 * Checks whether hydration is still in progress.
 *
 * waitForLazy = false:
 *   Wait only for currently queued root DOM nodes to be claimed.
 *
 * waitForLazy = true:
 *   Also wait for every discovered lazy boundary to finish hydration.
 */
export function isHydrating(waitForLazy = true): boolean {
  return hasUnclaimedHydrationNodes() || (waitForLazy && pendingLazyHydration.size > 0);
}

export function runAfterHydration<T>(callback: () => T, waitForLazy = true): void {
  if (isServer()) return;

  const owner = getOwner();

  // The root pass can still be active after its final SSR node was claimed.
  // Client-only mounts must wait until withHydration() has fully exited.
  if (rootHydrationDepth === 0 && !isHydrating(waitForLazy)) {
    runWithOwner(owner, callback);
    return;
  }

  afterHydrationTasks.add({
    callback,
    owner,
    waitForLazy,
  });

  scheduleAfterHydrationCheck();
}

function scheduleAfterHydrationCheck(): void {
  if (hydrationCheckScheduled || afterHydrationTasks.size === 0) {
    return;
  }

  hydrationCheckScheduled = true;

  requestAnimationFrame(() => {
    hydrationCheckScheduled = false;

    for (const task of [...afterHydrationTasks]) {
      if (task.owner?.disposed) {
        afterHydrationTasks.delete(task);
        continue;
      }

      if (isHydrating(task.waitForLazy)) {
        continue;
      }

      afterHydrationTasks.delete(task);

      try {
        runWithOwner(task.owner, task.callback);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  });
}

function finishIfClaimed(scope: LazyHydrationNodes): void {
  if (
    scope.id !== undefined &&
    scope.finished &&
    scope.elementIndex >= scope.elements.length &&
    scope.textIndex >= scope.texts.length &&
    scope.awaitIndex >= scope.awaitStates.length &&
    scope.nextChildLazyIndex >= scope.childLazyIDs.length
  ) {
    scope.hydrating = false;
    pendingLazyHydration.delete(scope.id);
    scheduleAfterHydrationCheck();
  }
}

/**
 * Claims from the current lazy boundary when one is active. Lazy queues are
 * independent, so sibling boundaries can hydrate in whichever order their
 * dynamic imports resolve.
 */
export function claimHydrationElement<T extends Element>() {
  const scope = getContext<LazyHydrationNodes>(LAZY_HYDRATION);

  try {
    if (scope) {
      return scope.elements[scope.elementIndex] as T;
    }

    return serverRenderedElements[hydrationElementIndex] as T;
  } finally {
    if (scope) {
      scope.elementIndex++;
      finishIfClaimed(scope);
    } else {
      hydrationElementIndex++;
      scheduleAfterHydrationCheck();
    }
  }
}

export function claimHydrationText() {
  const scope = getContext<LazyHydrationNodes>(LAZY_HYDRATION);

  try {
    if (scope) {
      return scope.texts[scope.textIndex];
    }

    return serverRenderedTexts[hydrationTextIndex];
  } finally {
    if (scope) {
      scope.textIndex++;
      finishIfClaimed(scope);
    } else {
      hydrationTextIndex++;
      scheduleAfterHydrationCheck();
    }
  }
}

/**
 * Claims the branch rendered by the server for the next authored Await.
 * A resolved marker means streamed SSR already replaced its fallback, even
 * when the corresponding client-side lazy import is still pending.
 */
export function claimHydrationAwaitState(): HydrationAwaitState | undefined {
  if (!isHydrationClaimActive()) return undefined;

  const scope = getContext<LazyHydrationNodes>(LAZY_HYDRATION);

  if (scope) {
    const state = scope.awaitStates[scope.awaitIndex++];
    finishIfClaimed(scope);
    return state;
  }

  const state = serverRenderedAwaitStates[hydrationAwaitIndex++];
  scheduleAfterHydrationCheck();
  return state;
}

export type ServerRenderedLazyRange = {
  start: Text;
  end: Text;
  nodes: Node[];
};

/**
 * Resolve a client lazy instance to its matching SSR range.
 *
 * The server and client can initialize sibling lazy modules in a different
 * order during a cold dev load. Their numeric IDs are therefore not sufficient
 * as the only lookup key. Each parent scope records its direct child ranges in
 * DOM order, and component owners claim those ranges once as their lazy
 * instances are created.
 */
export function resolveServerRenderedLazyID(lazyID: string | number): string {
  const owner = getOwner();
  const existingID = owner ? serverLazyIDsByOwner.get(owner) : undefined;

  if (existingID !== undefined) {
    return existingID;
  }

  // Client-side navigation and ordinary CSR renders have no server ranges to
  // consume. Keep their generated IDs untouched.
  if (!isHydrationClaimActive()) {
    return String(lazyID);
  }

  const parentScope = getContext<LazyHydrationNodes>(LAZY_HYDRATION);
  let serverID: string | undefined;

  if (parentScope) {
    serverID = parentScope.childLazyIDs[parentScope.nextChildLazyIndex];

    if (serverID !== undefined) {
      parentScope.nextChildLazyIndex++;
    }
  } else {
    serverID = serverRenderedRootLazyIDs[rootLazyHydrationIndex];

    if (serverID !== undefined) {
      rootLazyHydrationIndex++;
    }
  }

  const resolvedID = serverID ?? String(lazyID);

  // Cache the fallback too. A component with no SSR range must not consume a
  // later sibling's range if it is evaluated again before hydration finishes.
  if (owner) {
    serverLazyIDsByOwner.set(owner, resolvedID);
  }

  return resolvedID;
}

/**
 * Installs the matching server-rendered node queues on the lazy component
 * owner. The owner context survives deferred render effects and async retries.
 * If no SSR range exists, an empty scope prevents the component from consuming
 * unrelated root hydration nodes.
 */
export function withServerRenderedLazy<T>(lazyID: string | number, callback: () => T): T {
  const id = String(lazyID);
  let scope = serverRenderedLazy.get(id);

  if (!scope) {
    // A lazy component mounted by client-side navigation has no SSR range.
    // Give it an isolated, inactive scope instead of treating missing SSR
    // nodes as hydration mismatches.
    scope = createLazyHydrationNodes(id, rootHydrationDepth > 0);
    serverRenderedLazy.set(id, scope);
  }

  // Keep this scope on a dedicated owner. Writing it to the caller's owner
  // would leak the lazy boundary into sibling route renders created later.
  const owner = createOwner(undefined, { identity: false });

  return runWithOwner(owner, () => {
    setContext(LAZY_HYDRATION, scope);
    return callback();
  });
}

/** Capture the current cursor before a render-effect attempt. */
export function beginHydrationClaim(): HydrationClaimSnapshot {
  const scope = getContext<LazyHydrationNodes>(LAZY_HYDRATION);

  return {
    scope,
    elementIndex: scope?.elementIndex ?? hydrationElementIndex,
    textIndex: scope?.textIndex ?? hydrationTextIndex,
    awaitIndex: scope?.awaitIndex ?? hydrationAwaitIndex,
  };
}

/**
 * A suspended render attempt must not consume nodes. Its next attempt starts
 * from the same cursor, while other lazy owners keep their own independent
 * positions.
 */
export function rollbackHydrationClaim(snapshot: HydrationClaimSnapshot): void {
  if (snapshot.scope) {
    snapshot.scope.elementIndex = snapshot.elementIndex;
    snapshot.scope.textIndex = snapshot.textIndex;
    snapshot.scope.awaitIndex = snapshot.awaitIndex;
    return;
  }

  hydrationElementIndex = snapshot.elementIndex;
  hydrationTextIndex = snapshot.textIndex;
  hydrationAwaitIndex = snapshot.awaitIndex;
}

/**
 * Gets the original DOM range for a server-rendered lazy component.
 * Empty text anchors replace the temporary SSR comments and preserve the range.
 */
export function getServerRenderedLazyRange(
  lazyID: string | number,
): ServerRenderedLazyRange | undefined {
  const range = serverRenderedLazy.get(String(lazyID));

  if (!range?.start || !range.end) {
    return undefined;
  }

  const parent = range.start.parentNode;

  if (!parent || range.end.parentNode !== parent) {
    return undefined;
  }

  const nodes: Node[] = [];
  let node = range.start.nextSibling;

  while (node && node !== range.end) {
    nodes.push(node);
    node = node.nextSibling;
  }

  if (node !== range.end) {
    return undefined;
  }

  return {
    start: range.start,
    end: range.end,
    nodes,
  };
}

/**
 * Marks a lazy component complete after its initial client render. Later
 * reactive updates must no longer consume that boundary’s hydration queues.
 */
export function finishServerRenderedLazy(lazyID: string | number): void {
  const id = String(lazyID);
  const scope = serverRenderedLazy.get(id);

  if (!scope) {
    pendingLazyHydration.delete(id);
    scheduleAfterHydrationCheck();
    return;
  }

  scope.finished = true;
  finishIfClaimed(scope);
}

const LAZY_START_REGEX = new RegExp(`^${LAZY_START_SSR_MARKER}:(\\d+(?:\\.\\d+)*)$`);
const LAZY_END_REGEX = new RegExp(`^${LAZY_END_SSR_MARKER}:(\\d+(?:\\.\\d+)*)$`);

type LazyHydrationNodes = {
  id?: string;
  elements: Element[];
  texts: Text[];
  awaitStates: HydrationAwaitState[];
  childLazyIDs: string[];
  nextChildLazyIndex: number;
  elementIndex: number;
  textIndex: number;
  awaitIndex: number;
  hydrating: boolean;
  finished: boolean;
  start?: Text;
  end?: Text;
};

function createLazyHydrationNodes(id?: string, hydrating = true): LazyHydrationNodes {
  return {
    id,
    elements: [],
    texts: [],
    awaitStates: [],
    childLazyIDs: [],
    nextChildLazyIndex: 0,
    elementIndex: 0,
    textIndex: 0,
    awaitIndex: 0,
    hydrating,
    finished: false,
  };
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === 3;
}

function isCommentNode(node: Node): node is Comment {
  return node.nodeType === 8;
}

function findInternalRangeEnd(start: Comment): Comment | undefined {
  let depth = 0;
  let sibling = start.nextSibling;

  while (sibling) {
    if (isCommentNode(sibling)) {
      if (sibling.data === INTERNAL_RANGE_START_MARKER) {
        depth++;
      } else if (sibling.data === INTERNAL_RANGE_END_MARKER) {
        if (depth === 0) return sibling;
        depth--;
      }
    }

    sibling = sibling.nextSibling;
  }

  return undefined;
}

function getServerRenderedNodes(root: Node) {
  const doms: Node[] = [];
  const serverAwaitStates: HydrationAwaitState[] = [];
  const lazy = new Map<string, LazyHydrationNodes>();
  const rootLazyIDs: string[] = [];
  const boundaryStack: string[] = [];
  const internalRangeNodes = new WeakSet<Node>();

  function getOrCreateLazyNodes(id: string): LazyHydrationNodes {
    let nodes = lazy.get(id);

    if (!nodes) {
      nodes = createLazyHydrationNodes(id);
      lazy.set(id, nodes);
    }

    return nodes;
  }

  function addNode(node: Node) {
    const id = boundaryStack.at(-1);

    if (id === undefined) {
      doms.push(node);
      return;
    }

    const nodes = getOrCreateLazyNodes(id);

    if (isElement(node)) {
      nodes.elements.push(node);
    } else if (isTextNode(node)) {
      nodes.texts.push(node);
    }
  }

  function addAwaitState(state: HydrationAwaitState) {
    const id = boundaryStack.at(-1);

    if (id === undefined) {
      serverAwaitStates.push(state);
      return;
    }

    getOrCreateLazyNodes(id).awaitStates.push(state);
  }

  function flattenNode(node: Node) {
    if (internalRangeNodes.has(node)) return;

    if (isCommentNode(node) && node.data === INTERNAL_RANGE_START_MARKER) {
      const end = findInternalRangeEnd(node);

      if (!end) {
        throw new Error("[vynn] Unclosed internal SSR range during hydration.");
      }

      let current: Node | null = node.nextSibling;

      while (current) {
        const next = current.nextSibling;
        internalRangeNodes.add(current);

        if (
          isCommentNode(current) &&
          (current.data === INTERNAL_RANGE_START_MARKER ||
            current.data === INTERNAL_RANGE_END_MARKER)
        ) {
          current.parentNode?.removeChild(current);
        } else {
          removeInternalRangeMarkers(current);
        }

        if (current === end) break;
        current = next;
      }

      node.parentNode?.removeChild(node);
      end.parentNode?.removeChild(end);
      return;
    }

    if (isCommentNode(node) && node.data === INTERNAL_RANGE_END_MARKER) {
      node.parentNode?.removeChild(node);
      console.warn("[vynn] Unmatched internal SSR range end marker.");
      return;
    }

    if (isElement(node) && node.hasAttribute(RAW_HTML_SSR_ATTRIBUTE)) {
      // Raw HTML is opaque to Vynn. Claim its host element, but do not add any
      // of its unmanaged descendants to the hydration queues.
      node.removeAttribute(RAW_HTML_SSR_ATTRIBUTE);
      addNode(node);
      return;
    }

    if (isElement(node)) {
      // Head metadata and inert fallback templates are managed outside the
      // document's ordinary DOM walk and must not shift body hydration claims.
      if (
        (node.parentElement?.localName === "head" &&
          (node.localName === "title" || node.localName === "meta" || node.localName === "link")) ||
        (node.localName === "template" && node.hasAttribute("data-vynn-head-fallback"))
      ) {
        return;
      }
    }

    if (isCommentNode(node)) {
      const value = node.data;
      const awaitState =
        value === AWAIT_RESOLVED_SSR_MARKER
          ? "resolved"
          : value === AWAIT_FALLBACK_SSR_MARKER
            ? "fallback"
            : undefined;

      if (awaitState) {
        addAwaitState(awaitState);
        node.parentNode?.removeChild(node);
        return;
      }

      const start = LAZY_START_REGEX.exec(value);

      if (start) {
        const id = start[1];
        const parentID = boundaryStack.at(-1);
        const anchor = document.createTextNode("");

        if (parentID === undefined) {
          rootLazyIDs.push(id);
        } else {
          getOrCreateLazyNodes(parentID).childLazyIDs.push(id);
        }

        node.parentNode?.replaceChild(anchor, node);

        getOrCreateLazyNodes(id).start = anchor;
        boundaryStack.push(id);
        return;
      }

      const end = LAZY_END_REGEX.exec(value);

      if (end) {
        const id = end[1];
        const anchor = document.createTextNode("");

        node.parentNode?.replaceChild(anchor, node);

        getOrCreateLazyNodes(id).end = anchor;

        const index = boundaryStack.lastIndexOf(id);

        if (index !== -1) {
          boundaryStack.splice(index);
        } else {
          console.warn(`[vynn] Unmatched lazy boundary end marker: ${value}`);
        }

        return;
      }

      if (value === EMPTY_TEXT_SSR_MARKER) {
        const empty = document.createTextNode("");

        node.parentNode?.replaceChild(empty, node);
        addNode(empty);
        return;
      }

      if (value === TEXT_SSR_SEPARATOR) {
        node.parentNode?.removeChild(node);
        return;
      }
    }

    if (isElement(node) || isTextNode(node)) {
      addNode(node);
    }

    for (const child of [...node.childNodes]) {
      flattenNode(child);
    }
  }

  for (const child of [...root.childNodes]) {
    flattenNode(child);
  }

  return [
    doms.filter(isElement),
    doms.filter(isTextNode),
    serverAwaitStates,
    lazy,
    rootLazyIDs,
  ] as const;
}
