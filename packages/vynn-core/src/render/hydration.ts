import { getRenderMode } from "../context/render-mode";

let serverRenderedElements: HTMLElement[] = [];
let serverRenderedTexts: Text[] = [];

let hydrationElementIndex = 0;
let hydrationTextIndex = 0;
let isHydrationHydrating = false;

export function withHydration(callback: () => void, root: Node) {
  isHydrationHydrating = true;
  [serverRenderedElements, serverRenderedTexts] = getServerRenderedNodes(root);
  // serverRenderedElements = serverRenderedNodes[0];
  // serverRenderedTexts = serverRenderedNodes[1];

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
  if (getRenderMode() || !isHydrating()) {
    callback();
    return;
  }

  requestAnimationFrame(() => runAfterHydration(callback));
}

function getServerRenderedNodes(root: Node) {
  const doms: Node[] = [];

  function flattenNode(node: Node) {
    if (node instanceof HTMLElement) {
      doms.push(node);
    } else if (node instanceof Text) {
      doms.push(node);
    } else if (node instanceof Comment && node.textContent === "vynn:text") {
      // replace <!--vynn:text--> with normal string
      const empty = document.createTextNode("");
      node.replaceWith(empty);
      doms.push(empty);
    } else if (
      node instanceof Comment &&
      node.textContent === "vynn:separator"
    ) {
      node.remove();
    }

    for (const child of [...node.childNodes]) {
      flattenNode(child);
    }
  }

  for (const child of [...root.childNodes]) {
    flattenNode(child);
  }

  return [
    doms.filter((dom) => dom instanceof HTMLElement),
    doms.filter((dom) => dom instanceof Text),
  ] as const;
}
