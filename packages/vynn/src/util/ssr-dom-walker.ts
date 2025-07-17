import { isServer } from "./server-util";

let renderedNodes: Node[] = [];
let currentIndex = 0;

/**
 * SSR rendered dom walker
 *
 * @returns ssr dom utilities
 */
export function ssrDomWalker() {
  return {
    renderedNodes,
    get currentNode() {
      if (isServer) return undefined;

      return renderedNodes[currentIndex];
    },
    get isHydrating() {
      return !!renderedNodes[currentIndex];
    },
    next: () => {
      if (renderedNodes[currentIndex]) currentIndex++;
    },
    prev: () => {
      if (renderedNodes[currentIndex]) currentIndex--;
    },
  };
}

export function setSsrDomWalker(node: Node[], index?: number) {
  renderedNodes = node;
  if (index) currentIndex = index;
}

export let lazyNodes: Node[][] = [];

export function setLazyDom(node: Node[][]) {
  lazyNodes = node;
}
