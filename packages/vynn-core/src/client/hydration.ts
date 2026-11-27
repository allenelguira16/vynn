import {
  EMPTY_TEXT_SSR_MARKER,
  INTERNAL_RANGE_END_MARKER,
  INTERNAL_RANGE_START_MARKER,
  LAZY_END_SSR_MARKER,
  LAZY_START_SSR_MARKER,
  PORTAL_END_SSR_MARKER,
  PORTAL_START_SSR_MARKER,
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

let serverRenderedElements: Element[] = [];
let serverRenderedTexts: Text[] = [];
let serverRenderedLazy = new Map<string, LazyHydrationNodes>();

let hydrationElementIndex = 0;
let hydrationTextIndex = 0;
let rootHydrationDepth = 0;

const LAZY_HYDRATION = Symbol("vynn.lazy-hydration");

// Lazy boundaries discovered in the server-rendered HTML.
let pendingLazyHydration = new Set<string>();

type AfterHydrationTask = {
  callback: () => unknown;
  owner: Owner | null;
  waitForLazy: boolean;
};

export type HydrationClaimSnapshot = {
  scope: LazyHydrationNodes | undefined;
  elementIndex: number;
  textIndex: number;
};

const afterHydrationTasks = new Set<AfterHydrationTask>();
let hydrationCheckScheduled = false;

export function withHydration(callback: () => void, root: Node) {
  installDynamicTemplateHydration();
  [serverRenderedElements, serverRenderedTexts, serverRenderedLazy] = getServerRenderedNodes(root);

  hydrationElementIndex = 0;
  hydrationTextIndex = 0;

  pendingLazyHydration = new Set(serverRenderedLazy.keys());

  rootHydrationDepth++;

  try {
    callback();
  } finally {
    rootHydrationDepth = Math.max(0, rootHydrationDepth - 1);
    releaseRootHydrationNodes();
    scheduleAfterHydrationCheck();
  }
}

function hasUnclaimedHydrationNodes(): boolean {
  return (
    hydrationElementIndex < serverRenderedElements.length ||
    hydrationTextIndex < serverRenderedTexts.length
  );
}

/**
 * Drop the root claim queues once the initial pass has consumed every node.
 * Lazy ranges own separate queues and are released by finishIfClaimed().
 */
function releaseRootHydrationNodes(): void {
  if (rootHydrationDepth > 0 || hasUnclaimedHydrationNodes()) return;

  serverRenderedElements = [];
  serverRenderedTexts = [];
  hydrationElementIndex = 0;
  hydrationTextIndex = 0;
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
  if (
    scope.id !== undefined &&
    scope.finished &&
    scope.elementIndex >= scope.elements.length &&
    scope.textIndex >= scope.texts.length
  ) {
    const id = scope.id;
    scope.hydrating = false;

    // The lazy Owner may remain alive for later reactive updates, but it no
    // longer needs to retain the server DOM through its hydration scope.
    scope.elements = [];
    scope.texts = [];
    scope.start = undefined;
    scope.end = undefined;

    pendingLazyHydration.delete(id);
    serverRenderedLazy.delete(id);
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
      releaseRootHydrationNodes();
      scheduleAfterHydrationCheck();
    }
  }
}

export function claimHydrationText() {
  const scope = getOwnerContext<LazyHydrationNodes>(LAZY_HYDRATION);

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
      releaseRootHydrationNodes();
      scheduleAfterHydrationCheck();
    }
  }
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
export function withServerRenderedLazy<T>(lazyID: string, callback: () => T): T {
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
    setOwnerContext(LAZY_HYDRATION, scope);
    return callback();
  });
}

/** Capture the current cursor before a render-effect attempt. */
export function beginHydrationClaim(): HydrationClaimSnapshot {
  const scope = getOwnerContext<LazyHydrationNodes>(LAZY_HYDRATION);

  return {
    scope,
    elementIndex: scope?.elementIndex ?? hydrationElementIndex,
    textIndex: scope?.textIndex ?? hydrationTextIndex,
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
    return;
  }

  hydrationElementIndex = snapshot.elementIndex;
  hydrationTextIndex = snapshot.textIndex;
}

/**
 * Gets the original DOM range for a server-rendered lazy component.
 * Empty text anchors replace the temporary SSR comments and preserve the range.
 */
export function getServerRenderedLazyRange(
  lazyID: string,
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
export function finishServerRenderedLazy(lazyID: string): void {
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

function readLazyMarkerID(value: string, marker: string): string | undefined {
  const prefix = marker + ":";
  if (!value.startsWith(prefix)) return undefined;

  const id = value.slice(prefix.length);
  return id.length > 0 ? id : undefined;
}

type LazyHydrationNodes = {
  id?: string;
  elements: Element[];
  texts: Text[];
  elementIndex: number;
  textIndex: number;
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
    elementIndex: 0,
    textIndex: 0,
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
  const lazy = new Map<string, LazyHydrationNodes>();
  const boundaryStack: string[] = [];
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
      // Raw HTML is opaque to Vynn. Claim its host element, but do not add any
      // of its unmanaged descendants to the hydration queues.
      node.removeAttribute(RAW_HTML_SSR_ATTRIBUTE);
      addNode(node);
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
      const portalStartPrefix = PORTAL_START_SSR_MARKER + ":";

      if (value.startsWith(portalStartPrefix)) {
        const portalID = value.slice(portalStartPrefix.length);
        const portalEndValue = PORTAL_END_SSR_MARKER + ":" + portalID;
        let portalEnd: Node | null = node.nextSibling;

        while (
          portalEnd &&
          (!isCommentNode(portalEnd) || portalEnd.data !== portalEndValue)
        ) {
          portalEnd = portalEnd.nextSibling;
        }

        if (!portalEnd) {
          throw new Error("[vynn] Unclosed Portal range during hydration: " + portalID);
        }

        // Portal content has its own client mount pass. Exclude the server
        // range from the root hydration queues so it cannot shift later claims.
        return portalEnd.nextSibling;
      }

      const startID = readLazyMarkerID(value, LAZY_START_SSR_MARKER);

      if (startID !== undefined) {
        const id = startID;
        const anchor = document.createTextNode("");

        node.parentNode?.replaceChild(anchor, node);

        getOrCreateLazyNodes(id).start = anchor;
        boundaryStack.push(id);
        return nextSibling;
      }

      const endID = readLazyMarkerID(value, LAZY_END_SSR_MARKER);

      if (endID !== undefined) {
        const id = endID;
        const anchor = document.createTextNode("");

        node.parentNode?.replaceChild(anchor, node);

        getOrCreateLazyNodes(id).end = anchor;

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
        addNode(empty);
        return nextSibling;
      }

      if (value === TEXT_SSR_SEPARATOR) {
        node.parentNode?.removeChild(node);
        return nextSibling;
      }
    }

    if (isElement(node) || isTextNode(node)) {
      addNode(node);
    }

    // Walk sibling links directly. Reading childNodes creates and caches a
    // live NodeList for every node visited by this scanner in Chromium.
    let child: Node | null = node.firstChild;
    while (child) {
      child = flattenNode(child);
    }

    return nextSibling;
  }

  let child: Node | null = root.firstChild;
  while (child) {
    child = flattenNode(child);
  }

  return [doms.filter(isElement), doms.filter(isTextNode), lazy] as const;
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
