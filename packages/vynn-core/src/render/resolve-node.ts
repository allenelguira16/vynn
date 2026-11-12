import { claimHydrationText, isHydrationClaimActive } from "../client/hydration";
import { synchronizeHydrationText } from "../client/hydration-diagnostics";
import { getErrorBoundary, type ErrorBoundary } from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { JSX } from "../jsx-runtime";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";
import { isCreatingHeadElement, isHeadElement } from "./$head";
import { getCurrentDOMNamespace, getElementNamespace, withDOMNamespace } from "./namespace";

export type SSR_NODE =
  | SSR_ELEMENT
  | SSR_TEXT
  | SSR_ASYNC
  | SSR_DEFERRED
  | SSR_COMMENT
  | SSR_ERROR_BOUNDARY;

export type SSR_ELEMENT = {
  type: string;
  children: SSR_NODE[];
  parent: SSR_ELEMENT | null;
  attributes: Record<string, string>;
  innerHTML?: string;
  namespaceURI: string;

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
  errorBoundary?: ErrorBoundary;
  parent: SSR_ELEMENT | null;
};

export type SSR_ERROR_BOUNDARY = {
  type: "#error-boundary";
  id: number;
  children: () => SSR_NODE[];
  errorBoundary: ErrorBoundary;
  parent: null;
};

/**
 * SSR_ELEMENT uses a broad string tag, so the tag alone cannot discriminate
 * it from the special SSR node variants. These guards narrow by their
 * structural shape as well as their reserved node type.
 */
export function isSSRErrorBoundary(node: SSR_NODE): node is SSR_ERROR_BOUNDARY {
  return node.type === "#error-boundary" && typeof node.children === "function";
}

export function isSSRElement(node: SSR_NODE): node is SSR_ELEMENT {
  return "children" in node && Array.isArray(node.children) && "attributes" in node;
}

export function createSSRErrorBoundary(
  id: number,
  children: () => SSR_NODE[],
  errorBoundary: ErrorBoundary,
): SSR_ERROR_BOUNDARY {
  const owner = getOwner();

  return {
    type: "#error-boundary",
    id,
    parent: null,
    children: () => runWithOwner(owner, children),
    errorBoundary,
  };
}

export function createSSRNode(type: string): SSR_ELEMENT {
  const node: SSR_ELEMENT = {
    type,
    namespaceURI: getElementNamespace(type),
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
  const namespace = getCurrentDOMNamespace();

  return {
    type: "#async",
    parent: null,
    fallback: () => runWithOwner(owner, () => withDOMNamespace(namespace, fallback)),
    children: () => runWithOwner(owner, () => withDOMNamespace(namespace, children)),
    promises,
    errorBoundary: getErrorBoundary(),
  };
}

export type SSR_DEFERRED = {
  type: "#deferred";
  promises: Promise<unknown>[];
  children: () => SSR_NODE[];
  blocking: boolean;
  errorBoundary?: ErrorBoundary;
  parent: SSR_ELEMENT | null;
};

export function createSSRDeferred(
  children: () => SSR_NODE[],
  promises: Promise<unknown>[],
  blocking = false,
): SSR_DEFERRED {
  return {
    type: "#deferred",
    promises,
    children,
    blocking,
    errorBoundary: getErrorBoundary(),
    parent: null,
  };
}

export class SSRDeferredError {
  constructor(readonly reason: unknown) {}
}

export class SSRBoundaryFailure {
  constructor(
    readonly reason: Error,
    readonly boundary: ErrorBoundary,
    readonly handled = false,
  ) {}
}

export class SSRBoundaryPatchHandledError {}

// Repeated async reads can discover another resource after the first set has
// settled. Track every promise encountered during retries so a rejection is
// never lost merely because the next render no longer reads that resource.
async function resolveSSRChildrenAfterPromises(
  initialPromises: Promise<unknown>[],
  renderChildren: () => SSR_NODE[],
): Promise<SSR_NODE[]> {
  const promises = new Map<Promise<unknown>, PromiseSettledResult<unknown> | undefined>();

  for (const promise of initialPromises) {
    promises.set(promise, undefined);
  }

  while (true) {
    const pending = [...promises.keys()].filter((promise) => promises.get(promise) === undefined);

    if (pending.length > 0) {
      const settled = await Promise.allSettled(pending);

      for (let index = 0; index < pending.length; index++) {
        promises.set(pending[index], settled[index]);
      }
    }

    let children: SSR_NODE[];

    try {
      children = renderChildren();
    } catch (error) {
      if (!(error instanceof NotReadyError)) throw error;

      const state = promises.get(error.promise);

      if (state) {
        if (state.status === "rejected") throw state.reason;

        // A resource that still suspends on an already-fulfilled promise is
        // not making progress. Preserve the suspension instead of spinning.
        throw error;
      }

      promises.set(error.promise, undefined);
      continue;
    }

    // A rejected promise only fails this render when the retried child
    // still reads it. A conditional branch may no longer depend on a resource
    // that was pending during the first render.
    return children;
  }
}

export function resolveSSRAsyncChildren(node: SSR_ASYNC): Promise<SSR_NODE[]> {
  return resolveSSRChildrenAfterPromises(node.promises, node.children);
}

export function resolveSSRDeferredChildren(node: SSR_DEFERRED): Promise<SSR_NODE[]> {
  if (node.blocking) {
    return Promise.all(node.promises)
      .catch((reason: unknown) => {
        throw new SSRDeferredError(reason);
      })
      .then(() => node.children());
  }

  return resolveSSRChildrenAfterPromises(node.promises, node.children);
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
        error.blocking,
      ),
    ];
  }
}

/**
 * Resolves JSX into DOM nodes on the client or SSR nodes on the server.
 * The Node[] return type is retained for compatibility with existing callers.
 */
export function resolveNode(child: () => JSX.Element, claimText = true): Node[] {
  if (isServer()) {
    return resolveElementString(child()) as unknown as Node[];
  }

  return resolveElement(child(), claimText);
}

export function resolveElement(element: JSX.Element, claimText = true): Node[] {
  if (isHeadElement(element)) return [];

  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    const value = String(element);
    const text = document.createTextNode(value);

    if (claimText && !isCreatingHeadElement()) {
      const hydrating = isHydrationClaimActive();
      const claimed = claimHydrationText();

      if (!hydrating) {
        if (claimed) return [claimed];
      } else if (synchronizeHydrationText(claimed, value)) {
        return [claimed];
      }
    }

    return [text];
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
