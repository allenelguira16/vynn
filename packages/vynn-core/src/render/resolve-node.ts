import { claimHydrationText, isHydrationClaimActive } from "../client/hydration";
import { synchronizeHydrationText } from "../client/hydration-diagnostics";
import { getErrorBoundary, type ErrorBoundary } from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { JSX } from "../jsx-runtime";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";
import { isCreatingHeadElement, isHeadElement } from "./$head";
import { getCurrentDOMNamespace, getElementNamespace, withDOMNamespace } from "./namespace";

/**
 * Base class for every server-rendering node.
 *
 * Node classes provide runtime identity to the SSR renderers without relying
 * on reserved string tags or structural property checks.
 */
export abstract class SSR_NODE {
  parent: SSR_ELEMENT | null = null;
}

/** A server-side representation of an HTML or SVG element. */
export class SSR_ELEMENT extends SSR_NODE {
  children: SSR_NODE[] = [];
  attributes: Record<string, string> = {};
  innerHTML?: string;
  namespaceURI: string;

  constructor(public type: string) {
    super();
    this.namespaceURI = getElementNamespace(type);
  }

  insertBefore(child: SSR_NODE, before: SSR_NODE | null): void {
    if (child === before) return;

    if (child.parent) {
      child.parent.removeChild(child);
    }

    if (before === null) {
      this.children.push(child);
      child.parent = this;
      return;
    }

    const index = this.children.indexOf(before);

    if (index === -1) {
      throw new Error("The reference node is not a child of this node.");
    }

    this.children.splice(index, 0, child);
    child.parent = this;
  }

  appendChild(child: SSR_NODE): void {
    this.insertBefore(child, null);
  }

  removeChild(child: SSR_NODE): void {
    const index = this.children.indexOf(child);

    if (index === -1) return;

    this.children.splice(index, 1);
    child.parent = null;
  }
}

/** A server-side text node. */
export class SSR_TEXT extends SSR_NODE {
  constructor(public value: string) {
    super();
  }
}

/** A server-side comment node. */
export class SSR_COMMENT extends SSR_NODE {
  constructor(public value: string) {
    super();
  }
}

/**
 * Shared representation for SSR work that can resolve asynchronously.
 * The children callback is always executed with its captured owner and
 * DOM namespace, including when it is retried later.
 */
export abstract class SSR_PENDING extends SSR_NODE {
  readonly children: () => SSR_NODE[];
  readonly promises: Promise<unknown>[];

  protected constructor(
    children: () => SSR_NODE[],
    promises: Promise<unknown>[],
    public errorBoundary?: ErrorBoundary,
  ) {
    super();
    this.children = captureSSRRender(children);
    this.promises = promises;
  }
}

/** An asynchronous boundary with fallback content. */
export class SSR_ASYNC extends SSR_PENDING {
  readonly fallback: () => SSR_NODE[];

  constructor(
    fallback: () => SSR_NODE[],
    children: () => SSR_NODE[],
    promises: Promise<unknown>[],
    errorBoundary?: ErrorBoundary,
  ) {
    super(children, promises, errorBoundary);
    this.fallback = captureSSRRender(fallback);
  }
}

/** Deferred SSR work, optionally required to finish before rendering. */
export class SSR_DEFERRED extends SSR_PENDING {
  constructor(
    children: () => SSR_NODE[],
    promises: Promise<unknown>[],
    public blocking: boolean,
    errorBoundary?: ErrorBoundary,
  ) {
    super(children, promises, errorBoundary);
  }
}

/** An SSR error boundary whose children are rendered under its captured context. */
export class SSR_ERROR_BOUNDARY extends SSR_NODE {
  readonly id: number;
  readonly children: () => SSR_NODE[];
  readonly fallback: () => SSR_NODE[];
  readonly error: Error;

  constructor(id: number, fallback: () => SSR_NODE[], children: () => SSR_NODE[], error: Error) {
    super();
    this.id = id;
    this.fallback = captureSSRRender(fallback);
    this.children = captureSSRRender(children);
    this.error = error;
  }
}

/**
 * Captures the current owner and DOM namespace for work that may run after
 * the current synchronous render stack has completed.
 */
function captureSSRRender(render: () => SSR_NODE[]): () => SSR_NODE[] {
  const owner = getOwner();
  const namespace = getCurrentDOMNamespace();

  return () => runWithOwner(owner, () => withDOMNamespace(namespace, render));
}

export function createSSRErrorBoundary(
  id: number,
  fallback: () => SSR_NODE[],
  children: () => SSR_NODE[],
  error: Error,
): SSR_ERROR_BOUNDARY {
  return new SSR_ERROR_BOUNDARY(id, fallback, children, error);
}

export function createSSRNode(type: string): SSR_ELEMENT {
  return new SSR_ELEMENT(type);
}

export function createSSRText(value: string): SSR_TEXT {
  return new SSR_TEXT(value);
}

export function createSSRComment(value: string): SSR_COMMENT {
  return new SSR_COMMENT(value);
}

export function createSSRAsync(
  fallback: () => SSR_NODE[],
  children: () => SSR_NODE[],
  promises: Promise<unknown>[],
): SSR_ASYNC {
  return new SSR_ASYNC(fallback, children, promises, getErrorBoundary());
}

export function createSSRDeferred(
  children: () => SSR_NODE[],
  promises: Promise<unknown>[],
  blocking = false,
): SSR_DEFERRED {
  return new SSR_DEFERRED(children, promises, blocking, getErrorBoundary());
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

// // Repeated async reads can discover another resource after the first set has
// // settled. Track every promise encountered during retries so a rejection is
// // never lost merely because the next render no longer reads that resource.
// async function resolveSSRChildrenAfterPromises(
//   initialPromises: Promise<unknown>[],
//   renderChildren: () => SSR_NODE[],
// ): Promise<SSR_NODE[]> {
//   const promises = new Map<Promise<unknown>, PromiseSettledResult<unknown> | undefined>();

//   for (const promise of initialPromises) {
//     promises.set(promise, undefined);
//   }

//   while (true) {
//     const pending = [...promises.keys()].filter((promise) => promises.get(promise) === undefined);

//     if (pending.length > 0) {
//       const settled = await Promise.allSettled(pending);

//       for (let index = 0; index < pending.length; index++) {
//         promises.set(pending[index], settled[index]);
//       }
//     }

//     let children: SSR_NODE[];

//     try {
//       children = renderChildren();
//     } catch (error) {
//       if (!(error instanceof NotReadyError)) throw error;

//       const state = promises.get(error.promise);

//       if (state) {
//         if (state.status === "rejected") throw state.reason;

//         // A resource that still suspends on an already-fulfilled promise is
//         // not making progress. Preserve the suspension instead of spinning.
//         throw error;
//       }

//       promises.set(error.promise, undefined);
//       continue;
//     }

//     // A rejected promise only fails this render when the retried child
//     // still reads it. A conditional branch may no longer depend on a resource
//     // that was pending during the first render.
//     return children;
//   }
// }

// export function resolveSSRAsyncChildren(node: SSR_ASYNC): Promise<SSR_NODE[]> {
//   return resolveSSRChildrenAfterPromises(node.promises, node.children);
// }

// export function resolveSSRDeferredChildren(node: SSR_DEFERRED): Promise<SSR_NODE[]> {
//   if (node.blocking) {
//     return Promise.all(node.promises)
//       .catch((reason: unknown) => {
//         throw new SSRDeferredError(reason);
//       })
//       .then(() => node.children());
//   }

//   return resolveSSRChildrenAfterPromises(node.promises, node.children);
// }

/**
 * Resolves an SSR child expression and collects pending promises.
 *
 * If the expression suspends, returns a deferred SSR node that retries
 * the expression after the collected promises settle.
 */
export function resolveSSRChild(child: () => JSX.Element): SSR_NODE[] {
  try {
    return resolveNode(child) as unknown as SSR_NODE[];
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;

    return [createSSRDeferred(() => resolveSSRChild(child), [error.promise])];
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
