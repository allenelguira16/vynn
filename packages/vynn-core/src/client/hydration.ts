import {
  EMPTY_TEXT_SSR_MARKER,
  LAZY_END_SSR_MARKER,
  LAZY_START_SSR_MARKER,
  TEXT_SSR_SEPARATOR,
} from "../const";
import { isServer } from "../context/is-server-context";
import { getOwner, runWithOwner, type Owner } from "../life-cycle/owner";

let serverRenderedElements: HTMLElement[] = [];
let serverRenderedTexts: Text[] = [];
let serverRenderedLazy = new Map<number, LazyHydrationNodes>();

let hydrationElementIndex = 0;
let hydrationTextIndex = 0;

// Lazy boundaries discovered in the server-rendered HTML.
let pendingLazyHydration = new Set<number>();

// Prevent the same lazy nodes from being appended more than once.
let syncedLazyHydration = new Set<number>();

type AfterHydrationTask = {
  callback: () => unknown;
  owner: Owner | null;
  waitForLazy: boolean;
};

const afterHydrationTasks = new Set<AfterHydrationTask>();
let hydrationCheckScheduled = false;

export function withHydration(callback: () => void, root: Node) {
  [serverRenderedElements, serverRenderedTexts, serverRenderedLazy] =
    getServerRenderedNodes(root);

  // Indexes must start fresh for every hydration pass.
  hydrationElementIndex = 0;
  hydrationTextIndex = 0;

  pendingLazyHydration = new Set(serverRenderedLazy.keys());
  syncedLazyHydration = new Set();

  try {
    callback();
  } finally {
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
 * Checks whether hydration is still in progress.
 *
 * waitForLazy = false:
 *   Wait only for currently queued DOM nodes to be claimed.
 *
 * waitForLazy = true:
 *   Also wait for every discovered lazy boundary to finish hydration.
 */
export function isHydrating(waitForLazy = true): boolean {
  return (
    hasUnclaimedHydrationNodes() ||
    (waitForLazy && pendingLazyHydration.size > 0)
  );
}

export function runAfterHydration<T>(
  callback: () => T,
  waitForLazy = true,
): void {
  if (isServer()) return;

  const owner = getOwner();

  if (!isHydrating(waitForLazy)) {
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
      // A component may have been removed before its mount callback ran.
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
        // One failing callback must not prevent other ready callbacks.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  });
}

export function claimHydrationElement<T extends HTMLElement>() {
  try {
    return serverRenderedElements[hydrationElementIndex] as T;
  } finally {
    hydrationElementIndex++;
    scheduleAfterHydrationCheck();
  }
}

export function claimHydrationText() {
  try {
    return serverRenderedTexts[hydrationTextIndex];
  } finally {
    hydrationTextIndex++;
    scheduleAfterHydrationCheck();
  }
}

export function getServerRenderedLazyRange(
  lazyID: number,
): ServerRenderedLazyRange | undefined {
  const range = serverRenderedLazy.get(lazyID);

  if (!range?.start || !range.end) {
    return undefined;
  }

  const nodes: Node[] = [];
  const parent = range.start.parentNode;

  if (!parent || range.end.parentNode !== parent) {
    return undefined;
  }

  let node = range.start.nextSibling;

  while (node && node !== range.end) {
    nodes.push(node);
    node = node.nextSibling;
  }

  // A detached or malformed boundary is not a reusable range.
  if (node !== range.end) {
    return undefined;
  }

  return {
    start: range.start,
    end: range.end,
    nodes,
  };
}

export function syncServerRenderedLazy(lazyID: number) {
  if (isServer() || syncedLazyHydration.has(lazyID)) {
    return;
  }

  syncedLazyHydration.add(lazyID);

  const { elements, texts } = serverRenderedLazy.get(lazyID) ?? {
    elements: [],
    texts: [],
  };

  serverRenderedElements.push(...elements);
  serverRenderedTexts.push(...texts);

  scheduleAfterHydrationCheck();
}

/**
 * Called after the lazy component has synchronously claimed its SSR nodes.
 */
export function finishServerRenderedLazy(lazyID: number) {
  pendingLazyHydration.delete(lazyID);
  scheduleAfterHydrationCheck();
}

const LAZY_START_REGEX = new RegExp(`^${LAZY_START_SSR_MARKER}:(\\d+)$`);
const LAZY_END_REGEX = new RegExp(`^${LAZY_END_SSR_MARKER}:(\\d+)$`);

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

export type ServerRenderedLazyRange = {
  start: Comment;
  end: Comment;
  nodes: Node[];
};

type LazyHydrationNodes = {
  elements: HTMLElement[];
  texts: Text[];
  start?: Comment;
  end?: Comment;
};

function isHTMLElement(node: Node): node is HTMLElement {
  return (
    node.nodeType === 1 && (node as Element).namespaceURI === HTML_NAMESPACE
  );
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === 3;
}

function isCommentNode(node: Node): node is Comment {
  return node.nodeType === 8;
}

function getServerRenderedNodes(root: Node) {
  // Nodes outside lazy boundaries.
  const doms: Node[] = [];

  // Nodes belonging to each lazy boundary.
  const lazy = new Map<number, LazyHydrationNodes>();

  // Stack of nested lazy boundary IDs.
  const boundaryStack: number[] = [];

  function getOrCreateLazyNodes(id: number): LazyHydrationNodes {
    let nodes = lazy.get(id);

    if (!nodes) {
      nodes = {
        elements: [],
        texts: [],
      };

      lazy.set(id, nodes);
    }

    return nodes;
  }

  function addNode(node: Node) {
    const id = boundaryStack.at(-1);

    // Nodes inside a lazy boundary must not enter the root pools.
    if (id === undefined) {
      doms.push(node);
      return;
    }

    const nodes = getOrCreateLazyNodes(id);

    if (isHTMLElement(node)) {
      nodes.elements.push(node);
    } else if (isTextNode(node)) {
      nodes.texts.push(node);
    }
  }

  function flattenNode(node: Node) {
    if (isCommentNode(node)) {
      const value = node.data;

      const start = LAZY_START_REGEX.exec(value);

      if (start) {
        const id = Number(start[1]);

        // Keep the SSR boundary in the DOM so the client can reuse its exact
        // position instead of moving hydrated content into newly-created markers.
        getOrCreateLazyNodes(id).start = node;

        boundaryStack.push(id);
        return;
      }

      const end = LAZY_END_REGEX.exec(value);

      if (end) {
        const id = Number(end[1]);
        const index = boundaryStack.lastIndexOf(id);

        // Keep the closing boundary as the reusable end anchor.
        getOrCreateLazyNodes(id).end = node;

        if (index !== -1) {
          // Close this boundary and any nested entries above it.
          boundaryStack.splice(index);
        } else {
          console.warn(`[vynn] Unmatched lazy boundary end marker: ${value}`);
        }

        return;
      }

      if (value === EMPTY_TEXT_SSR_MARKER) {
        // Preserve the empty text node expected by hydration.
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

    if (isHTMLElement(node) || isTextNode(node)) {
      addNode(node);
    }

    // Continue through element descendants, including custom elements.
    for (const child of [...node.childNodes]) {
      flattenNode(child);
    }
  }

  for (const child of [...root.childNodes]) {
    flattenNode(child);
  }

  return [doms.filter(isHTMLElement), doms.filter(isTextNode), lazy] as const;
}
