import { JSX } from "../jsx-runtime";
import { IS_SERVER_ENV } from "../utils/is-server-env";

export type SSR_NODE = SSR_ELEMENT | SSR_TEXT;

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

function createSSRText(value: string): SSR_TEXT {
  return {
    type: "#text",
    value,
    parent: null,
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
  if (IS_SERVER_ENV) {
    try {
      return resolveElementString(child()) as unknown as Node[];
    } catch (error) {
      if (error instanceof Promise) {
        return error.then(() =>
          resolveElementString(child()),
        ) as unknown as Node[];
      } else {
        throw error;
      }
    }
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
    return [new Text(String(element))];
  }

  if (element instanceof Node) {
    return [element];
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

  return element.flatMap(resolveElementString);
}
