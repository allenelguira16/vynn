import { claimHydrationText, isHydrationClaimActive } from "../client/hydration";
import { synchronizeHydrationText } from "../client/hydration-diagnostics";
import { getErrorBoundary } from "../context/error-boundary";
import { getRuntimeContext, runWithRuntimeContext } from "../runtime/context";

import { JSX } from "../jsx-runtime";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity/async/not-ready-error";
import { getCurrentDOMNamespace, getElementNamespace, withDOMNamespace } from "./namespace";

/**
 * Base class for every server-rendering node.
 *
 * Node classes provide runtime identity to the SSR renderers without relying
 * on reserved string tags or structural property checks.
 */
export abstract class SSR_NODE {
  parent: SSR_ELEMENT | null = null;

  get nextSibling(): SSR_NODE | null {
    if (!this.parent) return null;

    const index = this.parent.children.indexOf(this);
    return index === -1 ? null : (this.parent.children[index + 1] ?? null);
  }

  get previousSibling(): SSR_NODE | null {
    if (!this.parent) return null;

    const index = this.parent.children.indexOf(this);
    return index <= 0 ? null : (this.parent.children[index - 1] ?? null);
  }
}

/** A server-side representation of an HTML or SVG element. */
export class SSR_ELEMENT extends SSR_NODE {
  children: SSR_NODE[] = [];
  attributes: Record<string, string> = {};

  get firstChild(): SSR_NODE | null {
    return this.children[0] ?? null;
  }

  get lastChild(): SSR_NODE | null {
    return this.children.at(-1) ?? null;
  }
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

type SSRErrorBoundaryHandler = (error: Error) => SSR_ERROR_BOUNDARY | void;

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
    public errorBoundary?: SSRErrorBoundaryHandler,
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
    errorBoundary?: SSRErrorBoundaryHandler,
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
    errorBoundary?: SSRErrorBoundaryHandler,
  ) {
    super(children, promises, errorBoundary);
  }
}

/** An SSR error boundary whose children are rendered under its captured context. */
export class SSR_ERROR_BOUNDARY extends SSR_NODE {
  readonly id: number;
  readonly children: () => SSR_NODE[];
  readonly fallback: () => SSR_NODE[];
  private resolvedChildren?: SSR_NODE[];
  error?: Error;
  readonly errorBoundary?: SSRErrorBoundaryHandler;

  constructor(
    id: number,
    fallback: () => SSR_NODE[],
    children: () => SSR_NODE[],
    error?: Error,
    errorBoundary?: SSRErrorBoundaryHandler,
  ) {
    super();
    this.id = id;
    this.fallback = captureSSRRender(fallback);
    this.children = captureSSRRender(() => this.resolvedChildren ?? children());
    this.error = error;
    this.errorBoundary = errorBoundary;
  }

  setChildren(children: SSR_NODE[]): void {
    this.resolvedChildren = children;
  }
}

/**
 * Captures the current owner and DOM namespace for work that may run after
 * the current synchronous render stack has completed.
 */
function captureSSRRender(render: () => SSR_NODE[]): () => SSR_NODE[] {
  const owner = getOwner();
  const namespace = getCurrentDOMNamespace();
  const runtimeContext = getRuntimeContext();

  return () =>
    runWithRuntimeContext(runtimeContext, () =>
      runWithOwner(owner, () => withDOMNamespace(namespace, render)),
    );
}

export function createSSRErrorBoundary(
  id: number,
  fallback: () => SSR_NODE[],
  children: () => SSR_NODE[],
  error?: Error,
  errorBoundary?: SSRErrorBoundaryHandler,
): SSR_ERROR_BOUNDARY {
  return new SSR_ERROR_BOUNDARY(id, fallback, children, error, errorBoundary);
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
  if (import.meta.env.SSR) {
    return resolveElementString(child()) as unknown as Node[];
  }

  return resolveElement(child(), claimText);
}

export function resolveElement(element: JSX.Element, claimText = true): Node[] {
  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    const value = String(element);
    const text = document.createTextNode(value);

    if (claimText) {
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
