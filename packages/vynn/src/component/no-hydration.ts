import { flattenDOMContents } from "~/client/flat-dom-contents";
import { JSX } from "~/types/jsx";
import { isServer } from "~/util/server-util";
import { ssrDomWalker } from "~/util/ssr-dom-walker";

/**
 * No Hydration component to tell renderer it should not be hydrated
 *
 * @param children - The children of the fragment.
 * @returns The fragment.
 */
export function NoHydration({ children }: { children?: () => JSX.Element }): () => JSX.Element {
  if (isServer && children)
    return () => ["<!--no-hydration-->", children(), "<!--end-no-hydration-->"];

  const { currentNode, next } = ssrDomWalker();
  if (!currentNode) {
    return () => null;
  }

  const start = previousCommentSibling(currentNode)!;
  const nodes = getNextSiblingsUntilEndNoHydration(start);

  const frag = document.createDocumentFragment() as unknown as HTMLElement;
  nodes.forEach((node) => frag.append(node));
  flattenDOMContents(frag).forEach(() => next());

  const end = findEndNoHydration(start);
  start.remove();
  end?.remove();

  return () => nodes;
}

function getNextSiblingsUntilEndNoHydration(node: Node): Node[] {
  const result = [];
  let next = node.nextSibling;

  while (next) {
    // Stop when we hit the comment <!--end-no-hydration-->
    if (next.nodeType === Node.COMMENT_NODE && next.nodeValue?.trim() === "end-no-hydration") {
      break;
    }

    // Collect only element siblings
    if (next.nodeType === Node.ELEMENT_NODE) {
      result.push(next);
    }

    next = next.nextSibling;
  }

  return result;
}

function previousCommentSibling(node: Node) {
  let prev = node.previousSibling;
  while (prev) {
    if (prev.nodeType === Node.COMMENT_NODE && prev.nodeValue?.trim() === "no-hydration") {
      return prev;
    }
    prev = prev.previousSibling;
  }
  return null;
}

function findEndNoHydration(start: Node): Comment | null {
  let next = start.nextSibling;
  while (next) {
    if (next.nodeType === Node.COMMENT_NODE && next.nodeValue?.trim() === "end-no-hydration") {
      return next as Comment;
    }
    next = next.nextSibling;
  }
  return null;
}
