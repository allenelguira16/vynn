import { forEachTrailingCommentRange } from "typescript/unstable/ast";
import { getRenderMode } from "../context/render-mode";

let serverRenderedElements: HTMLElement[] = [];
let serverRenderedTexts: Text[] = [];
let serverRenderedLazy = new Map<number, LazyHydrationNodes>();

let hydrationElementIndex = 0;
let hydrationTextIndex = 0;
let isHydrationHydrating = false;
let isIgnoreHydration = false;

export function withHydration(callback: () => void, root: Node) {
  isHydrationHydrating = true;
  [serverRenderedElements, serverRenderedTexts, serverRenderedLazy] =
    getServerRenderedNodes(root);

  console.log(serverRenderedElements);

  callback();
  isHydrationHydrating = false;
}

export function claimHydrationElement<T extends HTMLElement>() {
  try {
    const index = hydrationElementIndex;
    return serverRenderedElements[index] as T;
  } finally {
    hydrationElementIndex++;
  }
}

export function syncServerRenderedLazy(lazyID: number) {
  if (getRenderMode()) return;

  const { elements, texts } = serverRenderedLazy.get(lazyID) || {
    elements: [],
    texts: [],
  };

  serverRenderedElements.push(...elements);
  serverRenderedTexts.push(...texts);
}

export function claimHydrationText() {
  if (isIgnoreHydration) return undefined;

  try {
    const index = hydrationTextIndex;
    return serverRenderedTexts[index];
  } finally {
    hydrationTextIndex++;
  }
}

export function isHydrating() {
  return isHydrationHydrating;
}

export function ignoreHydration<T>(callback: () => T) {
  isIgnoreHydration = true;

  try {
    return callback();
  } finally {
    isIgnoreHydration = false;
  }
}

export function isHydrationIgnored() {
  return isIgnoreHydration;
}

export function resumeHydration() {
  isIgnoreHydration = false;
}

export function runAfterHydration<T>(callback: () => T) {
  if (!isHydrating()) {
    callback();
    return;
  }

  requestAnimationFrame(() => runAfterHydration(callback));
}

const START_RE = /^lazy:(\d+)$/;
const END_RE = /^\/lazy:(\d+)$/;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

type LazyHydrationNodes = {
  elements: HTMLElement[];
  texts: Text[];
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

      const start = START_RE.exec(value);

      if (start) {
        const id = Number(start[1]);

        // Create an entry even when the lazy range is empty.
        getOrCreateLazyNodes(id);

        boundaryStack.push(id);
        node.parentNode?.removeChild(node);
        return;
      }

      const end = END_RE.exec(value);

      if (end) {
        const id = Number(end[1]);
        const index = boundaryStack.lastIndexOf(id);

        if (index !== -1) {
          // Close this boundary and any nested entries above it.
          boundaryStack.splice(index);
        } else {
          console.warn(`[vynn] Unmatched lazy boundary end marker: ${value}`);
        }

        node.parentNode?.removeChild(node);
        return;
      }

      if (value === "vynn:text") {
        // Preserve the empty text node expected by hydration.
        const empty = document.createTextNode("");

        node.parentNode?.replaceChild(empty, node);
        addNode(empty);
        return;
      }

      if (value === "vynn:separator") {
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
