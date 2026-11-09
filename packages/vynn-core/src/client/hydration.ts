import {
  EMPTY_TEXT_SSR_MARKER,
  INTERNAL_RANGE_END_MARKER,
  INTERNAL_RANGE_START_MARKER,
  LAZY_END_SSR_MARKER,
  LAZY_START_SSR_MARKER,
  TEXT_SSR_SEPARATOR,
} from "../const";
import { isServer } from "../context/is-server-context";
import { removeInternalRangeMarkers } from "../dom/internal-range";
import { type Owner, createOwner, getContext, getOwner, runWithOwner, setContext } from "../life-cycle/owner";

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
  [serverRenderedElements, serverRenderedTexts, serverRenderedLazy] = getServerRenderedNodes(root);

  hydrationElementIndex = 0;
  hydrationTextIndex = 0;

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
    hydrationTextIndex < serverRenderedTexts.length
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
    scope.textIndex >= scope.texts.length
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
    // Give it an isolated, inactive scope instead of treating missing SSR
    // nodes as hydration mismatches.
    scope = createLazyHydrationNodes(id, rootHydrationDepth > 0);
    serverRenderedLazy.set(id, scope);
  }

  // Keep this scope on a dedicated owner. Writing it to the caller's owner
  // would leak the lazy boundary into sibling route renders created later.
  const owner = createOwner();

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
          (current.data === INTERNAL_RANGE_START_MARKER || current.data === INTERNAL_RANGE_END_MARKER)
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

    if (isElement(node)) {
      // Metadata rendered through Vynn's head registry is claimed separately
      // by $headTmpl and must not consume the application's element queue.
      if (
        node.parentElement?.localName === "head" &&
        node.hasAttribute("key") &&
        (node.localName === "title" || node.localName === "meta" || node.localName === "link")
      ) {
        return;
      }
    }

    if (isCommentNode(node)) {
      const value = node.data;
      const start = LAZY_START_REGEX.exec(value);

      if (start) {
        const id = start[1];
        const anchor = document.createTextNode("");

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

  return [doms.filter(isElement), doms.filter(isTextNode), lazy] as const;
}
