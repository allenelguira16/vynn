import { getRenderMode } from "../context/render-mode";

let serverRenderedElements: HTMLElement[] = [];
let serverRenderedTexts: Text[] = [];
let serverRenderedLazy = new Map<number, LazyHydrationNodes>();

let hydrationElementIndex = 0;
let hydrationTextIndex = 0;
let isHydrationHydrating = false;

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

export function runAfterHydration<T>(callback: () => T) {
  if (!isHydrating()) {
    callback();
    return;
  }

  requestAnimationFrame(() => runAfterHydration(callback));
}

const START_RE = /^lazy:(\d+)$/;
const END_RE = /^\/lazy:(\d+)$/;

type LazyHydrationNodes = {
  elements: HTMLElement[];
  texts: Text[];
};

function getServerRenderedNodes(root: Node) {
  const doms: Node[] = [];
  const lazy = new Map<number, LazyHydrationNodes>();
  const boundaryStack: number[] = [];

  function addNode(node: Node) {
    const id = boundaryStack.at(-1);

    if (id === undefined) {
      // Only nodes outside lazy boundaries go into the root pool.
      doms.push(node);
      return;
    }

    let nodes = lazy.get(id);

    if (!nodes) {
      nodes = { elements: [], texts: [] };
      lazy.set(id, nodes);
    }

    if (node instanceof HTMLElement) {
      nodes.elements.push(node);
    } else if (node instanceof Text) {
      nodes.texts.push(node);
    }
  }

  function flattenNode(node: Node) {
    if (node instanceof Comment) {
      const value = node.textContent ?? "";

      const start = START_RE.exec(value);

      if (start) {
        const id = Number(start[1]);

        if (!lazy.has(id)) {
          lazy.set(id, { elements: [], texts: [] });
        }

        boundaryStack.push(id);
        node.remove();
        return;
      }

      const end = END_RE.exec(value);

      if (end) {
        const id = Number(end[1]);
        const index = boundaryStack.lastIndexOf(id);

        if (index !== -1) {
          boundaryStack.splice(index);
        }

        node.remove();
        return;
      }

      if (value === "vynn:text") {
        const empty = document.createTextNode("");
        node.replaceWith(empty);
        addNode(empty);
        return;
      }

      if (value === "vynn:separator") {
        node.remove();
        return;
      }
    }

    if (node instanceof HTMLElement || node instanceof Text) {
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
    doms.filter((dom): dom is HTMLElement => dom instanceof HTMLElement),
    doms.filter((dom): dom is Text => dom instanceof Text),
    lazy,
  ] as const;
}
