import { JSX } from "../jsx-runtime";
import { getOwner, runWithOwner } from "../life-cycle/owner";

import { NotReadyError } from "../reactivity/not-ready-error";
import { claimHydrationText } from "../client/hydration";
import { isServer } from "../context/is-server-context";
import { isHeadElement, isCreatingHeadElement } from "./$head";

export type SSR_NODE =
  | SSR_ELEMENT
  | SSR_TEXT
  | SSR_ASYNC
  | SSR_DEFERRED
  | SSR_COMMENT;

export type SSR_ELEMENT = {
  type: string;
  children: SSR_NODE[];
  parent: SSR_ELEMENT | null;
  attributes: Record<string, string>;

  insertBefore(node: SSR_NODE, before: SSR_NODE | null): void;
  appendChild(node: SSR_NODE): void;
  removeChild(node: SSR_NODE): void;
};

export type SSR_TEXT = {
  type: "#text";
  value: string;
  parent: SSR_ELEMENT | null;
};

export type SSR_COMMENT = {
  type: "#comment";
  value: string;
  parent: SSR_ELEMENT | null;
};

export type SSR_ASYNC = {
  type: "#async";
  children: () => SSR_NODE[];
  fallback: () => SSR_NODE[];
  promises: Promise<unknown>[];
  parent: SSR_ELEMENT | null;
};

export function createSSRNode<T extends keyof HTMLElementTagNameMap>(
  type: T,
): SSR_ELEMENT {
  const node: SSR_ELEMENT = {
    type,
    children: [],
    parent: null,
    attributes: {},

    insertBefore(child, before) {
      if (child === before) return;

      if (child.parent) {
        child.parent.removeChild(child);
      }

      if (before === null) {
        node.children.push(child);
        child.parent = node;
        return;
      }

      const index = node.children.indexOf(before);

      if (index === -1) {
        throw new Error("The reference node is not a child of this node.");
      }

      node.children.splice(index, 0, child);
      child.parent = node;
    },

    appendChild(child) {
      node.insertBefore(child, null);
    },

    removeChild(child) {
      const index = node.children.indexOf(child);

      if (index === -1) return;

      node.children.splice(index, 1);
      child.parent = null;
    },
  };

  return node;
}

export function createSSRText(value: string): SSR_TEXT {
  return {
    type: "#text",
    value,
    parent: null,
  };
}

export function createSSRComment(value: string): SSR_COMMENT {
  return {
    type: "#comment",
    value,
    parent: null,
  };
}

export function createSSRAsync(
  fallback: () => SSR_NODE[],
  children: () => SSR_NODE[],
  promises: Promise<unknown>[],
): SSR_ASYNC {
  const owner = getOwner();

  return {
    type: "#async",
    parent: null,
    fallback: () => runWithOwner(owner, fallback),
    children: () => runWithOwner(owner, children),
    promises,
  };
}

export type SSR_DEFERRED = {
  type: "#deferred";
  promises: Promise<unknown>[];
  children: () => SSR_NODE[];
  parent: SSR_ELEMENT | null;
};

export function createSSRDeferred(
  children: () => SSR_NODE[],
  promises: Promise<unknown>[],
): SSR_DEFERRED {
  return {
    type: "#deferred",
    promises,
    children,
    parent: null,
  };
}

/**
 * Resolves an SSR child expression and collects pending promises.
 *
 * If the expression suspends, returns a deferred SSR node that retries
 * the expression after the collected promises settle.
 */
export function resolveSSRChild(child: () => JSX.Element): SSR_NODE[] {
  const owner = getOwner();

  try {
    return resolveNode(child) as unknown as SSR_NODE[];
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;

    return [
      createSSRDeferred(
        () => runWithOwner(owner, () => resolveSSRChild(child)),
        [error.promise],
      ),
    ];
  }
}

/**
 * Resolves JSX into DOM nodes on the client or SSR nodes on the server.
 * The Node[] return type is retained for compatibility with existing callers.
 */
export function resolveNode(
  child: () => JSX.Element,
  claimText = true,
): Node[] {
  if (isServer()) {
    return resolveElementString(child()) as unknown as Node[];
  }

  return resolveElement(child(), claimText);
}

export function resolveElement(
  element: JSX.Element,
  claimText = true,
): Node[] {
  if (isHeadElement(element)) return [];

  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    element = document.createTextNode(String(element));
    if (claimText && !isCreatingHeadElement()) {
      element = claimHydrationText() || element;
    }
    // console.log(element, claimHydrationText());
    return [element];
  }

  if (element instanceof Node) {
    return [element];
  }

  if (typeof element === "function") {
    return resolveElement((element as unknown as () => JSX.Element)(), claimText);
  }

  return element.flatMap((child) => resolveElement(child, claimText));
}

export function resolveElementString(element: JSX.Element): SSR_NODE[] {
  if (isHeadElement(element)) return [];

  if (element === null || element === undefined || element === false) {
    return [];
  }

  if (typeof element === "string" || typeof element === "number") {
    return [createSSRText(String(element))];
  }

  // Resolve functions before treating other non-array values as SSR elements.
  if (typeof element === "function") {
    return resolveElementString((element as unknown as () => JSX.Element)());
  }

  if (!Array.isArray(element)) {
    return [element as unknown as SSR_ELEMENT];
  }

  return element.flatMap(resolveElementString);
}
