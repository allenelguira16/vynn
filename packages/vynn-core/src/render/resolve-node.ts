import { JSX } from "../jsx-runtime";
import { getRenderMode } from "../context/render-mode";
import { getCurrentOwner, runWithOwner } from "../life-cycle/owner";
import {
  getAsyncBoundary,
  isInsideAwaitBoundary,
  withAsyncBoundary,
} from "../components/boundary";
import { NotReadyError } from "../reactivity/not-ready-error";

export type SSR_NODE = SSR_ELEMENT | SSR_TEXT | SSR_ASYNC | SSR_COMMENT;

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
  const owner = getCurrentOwner();

  return {
    type: "#async",
    parent: null,
    fallback: () => runWithOwner(owner, fallback),
    children: () => runWithOwner(owner, children),
    promises,
  };
}

/**
 * Resolves an SSR child expression and collects pending promises.
 *
 * If the expression suspends, returns a deferred SSR node that retries
 * the expression after the collected promises settle.
 */
export function resolveSSRChild(child: () => JSX.Element): SSR_NODE[] {
  // COMMENTED THIS OUT SINCE IT CAUSES PROBLEMS FOR NESTED AWAIT
  // if (getRenderMode() && isInsideAwaitBoundary()) {
  //   return resolveNode(child) as unknown as SSR_NODE[];
  // }

  const promises: Promise<unknown>[] = [];

  const register = (promise: Promise<unknown>) => {
    if (!promises.includes(promise)) {
      promises.push(promise);
    }
  };

  let nodes: SSR_NODE[] = [];

  try {
    nodes = withAsyncBoundary(
      register,
      () => resolveNode(child) as unknown as SSR_NODE[],
    );
  } catch (error) {
    if (!(error instanceof NotReadyError)) {
      throw error;
    }

    register(error.promise);
  }

  if (promises.length === 0) {
    return nodes;
  }

  return [
    createSSRAsync(
      () => [],
      () => resolveSSRChild(child),
      promises,
    ),
  ];
}

/**
 * Resolves JSX into DOM nodes on the client or SSR nodes on the server.
 * The Node[] return type is retained for compatibility with existing callers.
 */
export function resolveNode(child: () => JSX.Element): Node[] {
  if (getRenderMode()) {
    return resolveElementString(child()) as unknown as Node[];
  }

  return resolveElement(child());
}

function resolveElement(element: JSX.Element): Node[] {
  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    return [document.createTextNode(String(element))];
  }

  if (element instanceof Node) {
    return [element];
  }

  if (typeof element === "function") {
    return resolveElement((element as unknown as () => JSX.Element)());
  }

  return element.flatMap(resolveElement);
}

function resolveElementString(element: JSX.Element): SSR_NODE[] {
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
