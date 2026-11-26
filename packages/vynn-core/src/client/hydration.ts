import {
  EMPTY_TEXT_SSR_MARKER,
  INTERNAL_RANGE_END_MARKER,
  INTERNAL_RANGE_START_MARKER,
  LAZY_END_SSR_MARKER,
  LAZY_START_SSR_MARKER,
  RAW_HTML_SSR_ATTRIBUTE,
  TEXT_SSR_SEPARATOR,
} from "../const";

import {
  diagnoseHydrationAttribute,
  isHydrationElementCompatible,
  synchronizeHydrationText,
} from "./hydration-diagnostics";
import { installHydrationRuntime } from "./hydration-runtime";
import { installDynamicTemplateHydration } from "../render/$template";

import { removeInternalRangeMarkers } from "../dom/internal-range";
import { getOwnerContext, setOwnerContext } from "../context/owner-context";
import {
  type Owner,
  createOwner,
  getOwner,
  runWithOwner,
} from "../life-cycle/owner";

type HydrationCursor = {
  parent: Node;
  end: Node | null;
  current: Node | null;
  scopeId: string | undefined;
};

type HydrationScope = {
  id?: string;
  parentId?: string;
  elementCursor?: HydrationCursor;
  textCursor?: HydrationCursor;
  hydrating: boolean;
  finished: boolean;
  start?: Text;
  end?: Text;
};

type LazyHydrationNodes = HydrationScope & { id: string };

let rootHydrationScope: HydrationScope | undefined;
let serverRenderedLazy = new Map<string, LazyHydrationNodes>();
type LazyRangeReference = {
  parentId: string | undefined;
  end?: Text;
};

let lazyStartRanges = new WeakMap<Node, LazyRangeReference>();
let lazyBoundaryAnchors = new WeakSet<Node>();
let rawHTMLHydrationHosts = new WeakSet<Element>();
let internalRangeHydrationNodes = new WeakSet<Node>();
let rootHydrationDepth = 0;

const LAZY_HYDRATION = Symbol("vynn.lazy-hydration");
let pendingLazyHydration = new Set<string>();

type AfterHydrationTask = {
  callback: () => unknown;
  owner: Owner | null;
  waitForLazy: boolean;
};

export type HydrationClaimSnapshot = {
  scope: LazyHydrationNodes | undefined;
  rootScope: HydrationScope | undefined;
  elementCursor: HydrationCursor | undefined;
  textCursor: HydrationCursor | undefined;
  elementNode: Node | null;
  textNode: Node | null;
};

const afterHydrationTasks = new Set<AfterHydrationTask>();
let hydrationCheckScheduled = false;

export function withHydration(callback: () => void, root: Node) {
  installDynamicTemplateHydration();
  serverRenderedLazy = getServerRenderedNodes(root);
  rootHydrationScope = createHydrationScope(root);
  pendingLazyHydration = new Set(serverRenderedLazy.keys());

  for (const scope of serverRenderedLazy.values()) {
    const parent = scope.start?.parentNode;
    if (parent && scope.end?.parentNode === parent) {
      scope.elementCursor = createHydrationCursor(parent, scope.start.nextSibling, scope.end, scope.id);
      scope.textCursor = createHydrationCursor(parent, scope.start.nextSibling, scope.end, scope.id);
    }
  }

  rootHydrationDepth++;

  try {
    callback();
  } finally {
    rootHydrationDepth = Math.max(0, rootHydrationDepth - 1);
    finishRootIfClaimed();
    scheduleAfterHydrationCheck();
  }
}

function createHydrationCursor(
  parent: Node,
  current: Node | null,
  end: Node | null,
  scopeId: string | undefined,
): HydrationCursor {
  return { parent, current, end, scopeId };
}

function createHydrationScope(root: Node): HydrationScope {
  return {
    elementCursor: createHydrationCursor(root, root.firstChild, null, undefined),
    textCursor: createHydrationCursor(root, root.firstChild, null, undefined),
    hydrating: true,
    finished: false,
  };
}

function nextSiblingWithinHydrationScope(node: Node, cursor: HydrationCursor): Node | null {
  let current: Node | null = node;

  while (current && current !== cursor.parent) {
    const sibling = current.nextSibling;
    if (sibling && sibling !== cursor.end) return sibling;
    current = current.parentNode;
  }

  return null;
}

function isSkippedHydrationElement(element: Element): boolean {
  if (
    element.parentElement?.localName === "head" &&
    (element.localName === "title" ||
      element.localName === "meta" ||
      element.localName === "link")
  ) {
    return true;
  }

  return element.localName === "template" &&
    element.hasAttribute("data-vynn-head-fallback");
}

function nextHydrationTraversalNode(node: Node, cursor: HydrationCursor): Node | null {
  const nestedRange = lazyStartRanges.get(node);
  if (
    nestedRange &&
    nestedRange.parentId === cursor.scopeId &&
    nestedRange.end?.parentNode === node.parentNode
  ) {
    const next = nestedRange.end.nextSibling;
    return next === cursor.end ? null : next;
  }

  if (lazyBoundaryAnchors.has(node) || internalRangeHydrationNodes.has(node)) {
    return nextSiblingWithinHydrationScope(node, cursor);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    if (
      !rawHTMLHydrationHosts.has(element) &&
      !isSkippedHydrationElement(element) &&
      element.firstChild
    ) {
      return element.firstChild;
    }
  }

  return nextSiblingWithinHydrationScope(node, cursor);
}

function findNextHydrationNode(
  cursor: HydrationCursor | undefined,
  kind: "element" | "text",
): Element | Text | undefined {
  if (!cursor) return undefined;

  let node = cursor.current;
  while (node && node !== cursor.end) {
    const nestedRange = lazyStartRanges.get(node);
    if (
      nestedRange &&
      nestedRange.parentId === cursor.scopeId &&
      nestedRange.end?.parentNode === node.parentNode
    ) {
      const next = nestedRange.end.nextSibling;
      node = next === cursor.end ? null : next;
      cursor.current = node;
      continue;
    }

    if (lazyBoundaryAnchors.has(node) || internalRangeHydrationNodes.has(node)) {
      node = nextSiblingWithinHydrationScope(node, cursor);
      cursor.current = node;
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE && isSkippedHydrationElement(node as Element)) {
      node = nextSiblingWithinHydrationScope(node, cursor);
      cursor.current = node;
      continue;
    }

    const matches = kind === "element"
      ? node.nodeType === Node.ELEMENT_NODE
      : node.nodeType === Node.TEXT_NODE;

    if (matches) {
      cursor.current = node;
      return node as Element | Text;
    }

    node = nextHydrationTraversalNode(node, cursor);
    cursor.current = node;
  }

  cursor.current = null;
  return undefined;
}

function claimNextHydrationNode(
  cursor: HydrationCursor | undefined,
  kind: "element" | "text",
): Element | Text | undefined {
  const node = findNextHydrationNode(cursor, kind);
  if (!node || !cursor) return undefined;

  cursor.current = nextHydrationTraversalNode(node, cursor);
  return node;
}

function scopeHasUnclaimedNodes(scope: HydrationScope | undefined): boolean {
  if (!scope?.hydrating) return false;
  return (
    !!findNextHydrationNode(scope.elementCursor, "element") ||
    !!findNextHydrationNode(scope.textCursor, "text")
  );
}

function hasUnclaimedHydrationNodes(): boolean {
  return scopeHasUnclaimedNodes(rootHydrationScope);
}

function finishRootIfClaimed(): void {
  if (rootHydrationDepth !== 0 || !rootHydrationScope) return;
  if (scopeHasUnclaimedNodes(rootHydrationScope)) return;

  rootHydrationScope.hydrating = false;
  rootHydrationScope.elementCursor = undefined;
  rootHydrationScope.textCursor = undefined;
  rootHydrationScope = undefined;
}

/**
 * Returns whether the current render belongs to an initial hydration pass.
 *
 * Lazy components use their own scope so unrelated pending lazy boundaries
 * cannot make later client-side updates look like hydration work.
 */
export function isHydrationClaimActive(): boolean {
  const scope = getOwnerContext<LazyHydrationNodes>(LAZY_HYDRATION);

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
  if (import.meta.env.SSR) return;

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
  if (scope.finished && !scopeHasUnclaimedNodes(scope)) {
    scope.hydrating = false;
    scope.elementCursor = undefined;
    scope.textCursor = undefined;
    scope.start = undefined;
    scope.end = undefined;
    scope.parentId = undefined;
    pendingLazyHydration.delete(scope.id);
    serverRenderedLazy.delete(scope.id);
    scheduleAfterHydrationCheck();
  }
}

/**
 * Claims from the current lazy boundary when one is active. Lazy queues are
 * independent, so sibling boundaries can hydrate in whichever order their
 * dynamic imports resolve.
 */
export function claimHydrationElement<T extends Element>() {
  const scope = getOwnerContext<LazyHydrationNodes>(LAZY_HYDRATION);
  const cursor = scope ? scope.elementCursor : rootHydrationScope?.elementCursor;
  const node = claimNextHydrationNode(cursor, "element") as T | undefined;

  if (scope) finishIfClaimed(scope);
  else {
    finishRootIfClaimed();
    scheduleAfterHydrationCheck();
  }

  return node;
}

export function claimHydrationText() {
  const scope = getOwnerContext<LazyHydrationNodes>(LAZY_HYDRATION);
  const cursor = scope ? scope.textCursor : rootHydrationScope?.textCursor;
  const node = claimNextHydrationNode(cursor, "text");

  if (scope) finishIfClaimed(scope);
  else {
    finishRootIfClaimed();
    scheduleAfterHydrationCheck();
  }

  return node;
}

export type ServerRenderedLazyRange = {
  start: Text;
  end: Text;
  nodes: Node[];
};

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
    // Give it an isolated scope with no claimable nodes.
    scope = createLazyHydrationNodes(id, undefined);
    scope.hydrating = rootHydrationDepth > 0;
    serverRenderedLazy.set(id, scope);
  }

  // Keep this scope on a dedicated owner. Writing it to the caller's owner
  // would leak the lazy boundary into sibling route renders created later.
  const owner = createOwner(undefined, { identity: false });

  return runWithOwner(owner, () => {
    setOwnerContext(LAZY_HYDRATION, scope);
    return callback();
  });
}

/** Capture the current cursor before a render-effect attempt. */
export function beginHydrationClaim(): HydrationClaimSnapshot {
  const scope = getOwnerContext<LazyHydrationNodes>(LAZY_HYDRATION);
  const rootScope = scope ? undefined : rootHydrationScope;
  const elementCursor = scope ? scope.elementCursor : rootScope?.elementCursor;
  const textCursor = scope ? scope.textCursor : rootScope?.textCursor;

  return {
    scope,
    rootScope,
    elementCursor,
    textCursor,
    elementNode: elementCursor?.current ?? null,
    textNode: textCursor?.current ?? null,
  };
}

/**
 * A suspended render attempt must not consume nodes. Its next attempt starts
 * from the same cursor, while other lazy owners keep their own independent
 * positions.
 */
export function rollbackHydrationClaim(snapshot: HydrationClaimSnapshot): void {
  if (snapshot.scope) {
    if (snapshot.elementCursor) snapshot.elementCursor.current = snapshot.elementNode;
    if (snapshot.textCursor) snapshot.textCursor.current = snapshot.textNode;
    return;
  }

  if (snapshot.rootScope) rootHydrationScope = snapshot.rootScope;
  if (snapshot.elementCursor) snapshot.elementCursor.current = snapshot.elementNode;
  if (snapshot.textCursor) snapshot.textCursor.current = snapshot.textNode;
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

function createLazyHydrationNodes(id: string, parentId: string | undefined): LazyHydrationNodes {
  return {
    id,
    parentId,
    hydrating: true,
    finished: false,
  };
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
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

function getServerRenderedNodes(root: Node): Map<string, LazyHydrationNodes> {
  const lazy = new Map<string, LazyHydrationNodes>();
  const boundaryStack: string[] = [];
  lazyStartRanges = new WeakMap<Node, LazyRangeReference>();
  lazyBoundaryAnchors = new WeakSet<Node>();
  rawHTMLHydrationHosts = new WeakSet<Element>();
  internalRangeHydrationNodes = new WeakSet<Node>();

  function getOrCreateLazyNodes(
    id: string,
    parentId: string | undefined = boundaryStack.at(-1),
  ): LazyHydrationNodes {
    let nodes = lazy.get(id);
    if (!nodes) {
      nodes = createLazyHydrationNodes(id, parentId);
      lazy.set(id, nodes);
    }
    return nodes;
  }

  function flattenNode(node: Node): Node | null {
    const nextSibling = node.nextSibling;

    if (isCommentNode(node) && node.data === INTERNAL_RANGE_START_MARKER) {
      const end = findInternalRangeEnd(node);

      if (!end) {
        throw new Error("[vynn] Unclosed internal SSR range during hydration.");
      }

      // Consume the internal range as one unit. Preserve the sibling after
      // its end before removing range markers and their managed contents.
      const afterRange = end.nextSibling;
      let current: Node | null = node.nextSibling;

      while (current) {
        const next: Node | null = current.nextSibling;

        if (
          isCommentNode(current) &&
          (current.data === INTERNAL_RANGE_START_MARKER ||
            current.data === INTERNAL_RANGE_END_MARKER)
        ) {
          current.parentNode?.removeChild(current);
        } else {
          internalRangeHydrationNodes.add(current);
          removeInternalRangeMarkers(current);
        }

        if (current === end) break;
        current = next;
      }

      node.parentNode?.removeChild(node);
      end.parentNode?.removeChild(end);
      return afterRange;
    }

    if (isCommentNode(node) && node.data === INTERNAL_RANGE_END_MARKER) {
      node.parentNode?.removeChild(node);
      console.warn("[vynn] Unmatched internal SSR range end marker.");
      return nextSibling;
    }

    if (isElement(node) && node.hasAttribute(RAW_HTML_SSR_ATTRIBUTE)) {
      // Raw HTML is opaque to Vynn. Claim its host element, but do not traverse
      // or retain its unmanaged descendants in the hydration cursor.
      node.removeAttribute(RAW_HTML_SSR_ATTRIBUTE);
      rawHTMLHydrationHosts.add(node);
      return nextSibling;
    }

    if (isElement(node)) {
      // Head metadata and inert fallback templates are managed outside the
      // document's ordinary DOM walk and must not shift body hydration claims.
      if (
        (node.parentElement?.localName === "head" &&
          (node.localName === "title" || node.localName === "meta" || node.localName === "link")) ||
        (node.localName === "template" && node.hasAttribute("data-vynn-head-fallback"))
      ) {
        return nextSibling;
      }
    }

    if (isCommentNode(node)) {
      const value = node.data;
      const start = LAZY_START_REGEX.exec(value);

      if (start) {
        const id = start[1];
        const anchor = document.createTextNode("");

        node.parentNode?.replaceChild(anchor, node);

        const scope = getOrCreateLazyNodes(id, boundaryStack.at(-1));
        scope.start = anchor;
        lazyStartRanges.set(anchor, { parentId: scope.parentId });
        lazyBoundaryAnchors.add(anchor);
        boundaryStack.push(id);
        return nextSibling;
      }

      const end = LAZY_END_REGEX.exec(value);

      if (end) {
        const id = end[1];
        const anchor = document.createTextNode("");

        node.parentNode?.replaceChild(anchor, node);

        const scope = getOrCreateLazyNodes(id, boundaryStack.at(-2));
        scope.end = anchor;
        if (scope.start) {
          const range = lazyStartRanges.get(scope.start);
          if (range) range.end = anchor;
        }
        lazyBoundaryAnchors.add(anchor);

        const index = boundaryStack.lastIndexOf(id);

        if (index !== -1) {
          boundaryStack.splice(index);
        } else {
          console.warn(`[vynn] Unmatched lazy boundary end marker: ${value}`);
        }

        return nextSibling;
      }

      if (value === EMPTY_TEXT_SSR_MARKER) {
        const empty = document.createTextNode("");

        node.parentNode?.replaceChild(empty, node);
        return nextSibling;
      }

      if (value === TEXT_SSR_SEPARATOR) {
        node.parentNode?.removeChild(node);
        return nextSibling;
      }
    }

    // Walk sibling links directly. This preparation pass records only lazy
    // range boundaries; ordinary element and text nodes are reached on demand
    // by the hydration cursors. Reading childNodes creates and caches a live
    // NodeList for every node visited by this scanner in Chromium.
    let child = node.firstChild;
    while (child) {
      child = flattenNode(child);
    }

    return nextSibling;
  }

  let child = root.firstChild;
  while (child) {
    child = flattenNode(child);
  }

  return lazy;
}

// Make the real implementation available only to bundles that include the
// hydration entrypoint. Ordinary client rendering imports the lightweight bridge.
installHydrationRuntime({
  isClaimActive: isHydrationClaimActive,
  isHydrating,
  claimElement: <T extends Element>() => claimHydrationElement<T>(),
  claimText: claimHydrationText,
  isElementCompatible: isHydrationElementCompatible,
  synchronizeText: synchronizeHydrationText,
  diagnoseAttribute: diagnoseHydrationAttribute,
  withServerRenderedLazy,
  getServerRenderedLazyRange,
  finishServerRenderedLazy,
  runAfterHydration,
});
