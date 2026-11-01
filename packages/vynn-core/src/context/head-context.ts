import { getContext, setContext } from "../life-cycle/owner";

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

function createHeadContext(): HeadContext {
  const candidates = new Map<HeadTag, HTMLElement[]>();

  if (typeof document !== "undefined") {
    for (const tag of ["title", "meta", "link"] as const) {
      candidates.set(tag, Array.from(document.head.querySelectorAll<HTMLElement>(tag)));
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
  const context = getContext<HeadContext>(HEAD_CONTEXT);

  if (!context) {
    throw new Error("[vynn]: getHeadContext must be initialized with initializeHeadContext");
  }

  return context;
}

/**
 * Initializes a fresh document-head registry for a client or server render.
 * Existing matching head nodes are collected as candidates for reuse.
 */
export function initializeHeadContext() {
  setContext<HeadContext>(HEAD_CONTEXT, createHeadContext());
}

/** Notifies subscribers that the head registry has changed. */
export function notifyHeadContext(context: HeadContext): void {
  for (const listener of context.listeners) listener();
}

/** Subscribes to head registry changes without depending on a rendering mode. */
export function subscribeHeadContext(context: HeadContext, listener: () => void): () => void {
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
