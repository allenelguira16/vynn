import { JSX } from "../jsx-runtime";
import { escapeHtml } from "../utils/escape-html";
import { getRenderMode } from "../context/render-mode";
import { getCurrentOwner, runWithOwner } from "../life-cycle/owner";

export type SSR_NODE = SSR_ELEMENT | SSR_TEXT | SSR_ASYNC | SSR_COMMENT;

export type SSR_ELEMENT = {
  type: string;
  children: SSR_NODE[];
  parent: SSR_ELEMENT | null;
  attributes: Record<string, string>;

  insertBefore(node: SSR_ELEMENT, before: SSR_ELEMENT | null): void;
  appendChild(node: SSR_ELEMENT): void;
  removeChild(node: SSR_ELEMENT): void;
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
  promises: Promise<any>[];
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
      if (child.parent) {
        child.parent.removeChild(child);
      }

      child.parent = node;

      if (before === null) {
        node.children.push(child);
        return;
      }

      const index = node.children.indexOf(before);

      if (index === -1) {
        throw new Error("The reference node is not a child of this node.");
      }

      node.children.splice(index, 0, child);
    },

    appendChild(child) {
      node.insertBefore(child, null);
    },

    removeChild(child) {
      const index = node.children.indexOf(child);

      if (index === -1) {
        return;
      }

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
    fallback: () => runWithOwner(owner, fallback),
    children: () => runWithOwner(owner, children),
    promises,
  };
}

/**
 * Resolves a JSX value into an array of DOM nodes.
 *
 * Empty JSX values are represented by an empty text node, while strings,
 * numbers, DOM nodes, and nested arrays are normalized into a flat node list.
 *
 * @param child A function that returns the JSX value to resolve.
 * @returns The resolved DOM nodes.
 */
export function resolveNode(child: () => JSX.Element): Node[] {
  // if (getRenderMode() === "async") {
  //   try {
  //     return resolveElementString(child()) as unknown as Node[];
  //   } catch (error) {
  //     if (!(error instanceof NotReadyError)) throw error;

  //     // console.log();
  //     return error.promise.then(() => {
  //       console.log(child());
  //       return resolveElementString(child());
  //     }) as unknown as Node[];
  //   }
  // }

  if (getRenderMode()) {
    return resolveElementString(child()) as unknown as Node[];
  }

  return resolveElement(child());
}

/**
 * Recursively resolves a JSX value into DOM nodes.
 *
 * @param element The JSX value to resolve.
 * @returns The DOM nodes represented by the JSX value.
 */
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

  if (element instanceof Function) {
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

  // console.log(element);
  if (!Array.isArray(element)) {
    return [element as unknown as SSR_ELEMENT];
  }

  if (element instanceof Function) {
    return resolveElementString((element as unknown as () => JSX.Element)());
  }

  return element.flatMap(resolveElementString);
}
