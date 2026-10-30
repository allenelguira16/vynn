import { getOwner, type Owner } from "../life-cycle/owner";

export type HeadTag = "title" | "meta" | "link";

export type HeadEntry = {
  element: object;
  order: number;
};

export type HeadContext = {
  entries: HeadEntry[];
  candidates: Map<HeadTag, HTMLElement[]>;
  nextOrder: number;
  buildingHeadElements: number;
  listeners: Set<() => void>;
};

const HEAD_CONTEXT = Symbol.for("vynn.head-context");

function getRootOwner(): Owner {
  let owner = getOwner();

  if (!owner) {
    throw new Error(
      "[vynn]: Head elements must be rendered inside a Vynn render root.",
    );
  }

  while (owner.parent) owner = owner.parent;
  return owner;
}

function createHeadContext(): HeadContext {
  const candidates = new Map<HeadTag, HTMLElement[]>();

  if (typeof document !== "undefined") {
    for (const tag of ["title", "meta", "link"] as const) {
      candidates.set(
        tag,
        Array.from(
          document.head.querySelectorAll<HTMLElement>(tag),
        ),
      );
    }
  }

  return {
    entries: [],
    candidates,
    nextOrder: 0,
    buildingHeadElements: 0,
    listeners: new Set(),
  };
}

/** Returns the head registry associated with the current render root. */
export function getHeadContext(): HeadContext {
  const root = getRootOwner();
  let context = root.context.get(HEAD_CONTEXT) as HeadContext | undefined;

  if (!context) {
    context = createHeadContext();
    root.context.set(HEAD_CONTEXT, context);
  }

  return context;
}

/** Returns the current registry without creating one. */
export function peekHeadContext(): HeadContext | undefined {
  let owner = getOwner();
  if (!owner) return undefined;

  while (owner.parent) owner = owner.parent;
  return owner.context.get(HEAD_CONTEXT) as HeadContext | undefined;
}

/**
 * Initializes a fresh document-head registry for a client or server render.
 * Existing matching head nodes are collected as candidates for reuse.
 */
export function initializeHeadContext(): HeadContext {
  const root = getRootOwner();
  const context = createHeadContext();

  root.context.set(HEAD_CONTEXT, context);
  return context;
}

/** Notifies subscribers that the head registry has changed. */
export function notifyHeadContext(context: HeadContext): void {
  for (const listener of context.listeners) listener();
}

/** Subscribes to head registry changes without depending on a rendering mode. */
export function subscribeHeadContext(
  context: HeadContext,
  listener: () => void,
): () => void {
  context.listeners.add(listener);
  return () => context.listeners.delete(listener);
}

/** Creates the stable identity used to match and deduplicate metadata tags. */
export function getHeadIdentity(
  tag: HeadTag,
  getAttribute: (name: string) => string | null,
  order: number,
): string {
  if (tag === "title") return "title";

  if (tag === "meta") {
    const charset = getAttribute("charset");
    if (charset !== null) return "meta:charset";

    const name = getAttribute("name");
    if (name) return `meta:name:${name.toLowerCase()}`;

    const property = getAttribute("property");
    if (property) return `meta:property:${property.toLowerCase()}`;

    const httpEquiv = getAttribute("http-equiv");
    if (httpEquiv) return `meta:http-equiv:${httpEquiv.toLowerCase()}`;
  }

  if (tag === "link") {
    const rel = getAttribute("rel")?.toLowerCase() ?? "";
    const href = getAttribute("href") ?? "";

    if (rel === "canonical") return "link:canonical";
    return `link:${rel}:${href}`;
  }

  return `head:${order}`;
}

/** Returns the last registered entry for each metadata identity. */
export function getHeadWinners(
  context: HeadContext,
  getIdentity: (entry: HeadEntry) => string,
): HeadEntry[] {
  const winners = new Map<string, HeadEntry>();

  for (const entry of context.entries) {
    winners.set(getIdentity(entry), entry);
  }

  return [...winners.values()].sort((a, b) => a.order - b.order);
}
