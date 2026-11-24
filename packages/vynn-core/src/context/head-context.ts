import { getOwner } from "../life-cycle/owner";
import { isWithinInternalRange } from "../dom/internal-range";
import { getOwnerContext, setRootOwnerContext } from "./owner-context";

export type HeadTag = "title" | "meta" | "link";

export type HeadGroup = {
  order: number;
  entries: HeadEntry[];
  initializing: boolean;
};

export type HeadEntry = {
  tag: HeadTag;
  attributes: Record<string, string>;
  children: string;
  identity: string;
  order: number;
  collection?: string;
  collectionRoot?: boolean;
  group?: HeadGroup;
};

export type HeadContext = {
  entries: HeadEntry[];
  groups: HeadGroup[];
  activeElements: Map<string, HTMLElement>;
  preserveInitialDocument: boolean;
  candidates: Map<HeadTag, HTMLElement[]>;
  fallbackTemplate: HTMLTemplateElement | null;
  initialNodes: Node[];
  nextOrder: number;
  listeners: Set<() => void>;
};

const HEAD_CONTEXT = Symbol.for("vynn.head-context");

function createHeadContext(): HeadContext {
  const candidates = new Map<HeadTag, HTMLElement[]>();
  const fallbackTemplate =
    typeof document === "undefined"
      ? null
      : (document.head.querySelector("template[data-vynn-head-fallback]") as HTMLTemplateElement | null);

  if (typeof document !== "undefined") {
    for (const tag of ["title", "meta", "link"] as const) {
      candidates.set(
        tag,
        [
          ...Array.from(document.head.children),
          ...Array.from(fallbackTemplate?.content.children ?? []),
        ].filter((element) => {
          if (element.localName !== tag || isWithinInternalRange(element)) return false;

          // Vite-owned stylesheets belong to the document shell, not to
          // application metadata declarations.
          if (
            tag === "link" &&
            element.getAttribute("rel")?.toLowerCase().split(/\s+/).includes("stylesheet") &&
            !element.hasAttribute("key")
          ) {
            return false;
          }

          return true;
        }) as HTMLElement[],
      );
    }
  }

  return {
    entries: [],
    groups: [],
    activeElements: new Map(),
    preserveInitialDocument: false,
    candidates,
    fallbackTemplate,
    initialNodes: typeof document === "undefined" ? [] : [...document.head.childNodes],
    nextOrder: 0,
    listeners: new Set(),
  };
}

/** Returns the head registry associated with the current owner, when present. */
export function getOptionalHeadContext(): HeadContext | undefined {
  return getOwnerContext<HeadContext>(HEAD_CONTEXT);
}

/** Returns the head registry associated with the current render root. */
export function getHeadContext(): HeadContext {
  const context = getOptionalHeadContext();
  if (context) return context;

  if (!getOwner()) {
    throw new Error("[vynn]: Head rendering requires an active owner.");
  }

  return initializeHeadContext();
}

/**
 * Initializes a fresh document-head registry for a client or server render.
 * Existing document-head children are retained as candidates for reconciliation.
 */
export function initializeHeadContext(): HeadContext {
  const context = createHeadContext();
  setRootOwnerContext<HeadContext>(HEAD_CONTEXT, context);
  return context;
}

/** Refreshes candidates after a client-only full-document root is installed. */
export function refreshHeadCandidates(context: HeadContext): void {
  const fallbackTemplate = document.head.querySelector(
    "template[data-vynn-head-fallback]",
  ) as HTMLTemplateElement | null;

  const candidates = new Map<HeadTag, HTMLElement[]>();

  for (const tag of ["title", "meta", "link"] as const) {
    candidates.set(
      tag,
      [
        ...Array.from(document.head.children),
        ...Array.from(fallbackTemplate?.content.children ?? []),
      ].filter((element) => {
        if (element.localName !== tag || isWithinInternalRange(element)) return false;

        if (
          tag === "link" &&
          element.getAttribute("rel")?.toLowerCase().split(/\s+/).includes("stylesheet") &&
          !element.hasAttribute("key")
        ) {
          return false;
        }

        return true;
      }) as HTMLElement[],
    );
  }

  context.candidates = candidates;
  context.fallbackTemplate = fallbackTemplate;
}

/** Notifies subscribers that the head registry has changed. */
export function notifyHeadContext(context: HeadContext): void {
  for (const listener of context.listeners) listener();
}

/** Subscribes to registry changes for SSR streaming head patches. */
export function subscribeHeadContext(context: HeadContext, listener: () => void): () => void {
  context.listeners.add(listener);
  return () => context.listeners.delete(listener);
}

/** Returns the base identity used to match singleton metadata declarations. */
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

/**
 * Open Graph declares these properties as ordered arrays. Structured image,
 * video, and audio properties belong to their preceding root property.
 */
export function getHeadCollectionIdentity(
  tag: HeadTag,
  getAttribute: (name: string) => string | null,
): { key: string; root: boolean } | undefined {
  if (tag !== "meta") return undefined;

  const property = getAttribute("property")?.toLowerCase();
  if (!property) return undefined;

  const roots = ["og:image", "og:video", "og:audio", "og:locale:alternate"];

  for (const root of roots) {
    if (property === root || property.startsWith(`${root}:`)) {
      return {
        key: `meta:property:${root}`,
        root: property === root || (root === "og:image" && property === "og:image:url"),
      };
    }
  }

  return undefined;
}

/** Returns collections explicitly replaced by currently active nested <head> groups. */
export function getReplacedHeadCollections(context: HeadContext): Set<string> {
  const replaced = new Set<string>();

  for (const group of context.groups) {
    for (const entry of group.entries) {
      if (entry.collectionRoot && entry.collection) replaced.add(entry.collection);
    }
  }

  return replaced;
}

/**
 * Resolves metadata declarations by ownership layer. Individual declarations
 * replace singleton identities and append array values. A nested <head> group
 * replaces inherited values for each identity or array collection it declares.
 */
export function getHeadWinners(context: HeadContext): HeadEntry[] {
  const latestGroupByIdentity = new Map<string, HeadGroup>();
  const latestGroupByCollection = new Map<string, HeadGroup>();

  for (const group of [...context.groups].sort((left, right) => left.order - right.order)) {
    for (const entry of group.entries) {
      if (entry.collectionRoot && entry.collection) {
        latestGroupByCollection.set(entry.collection, group);
      } else if (!entry.collection) {
        latestGroupByIdentity.set(entry.identity, group);
      }
    }
  }

  const winners: HeadEntry[] = [];
  const singletonEntries = new Map<string, HeadEntry[]>();
  const collectionEntries = new Map<string, HeadEntry[]>();

  for (const entry of context.entries) {
    if (entry.collection) {
      const entries = collectionEntries.get(entry.collection) ?? [];
      entries.push(entry);
      collectionEntries.set(entry.collection, entries);
    } else {
      const entries = singletonEntries.get(entry.identity) ?? [];
      entries.push(entry);
      singletonEntries.set(entry.identity, entries);
    }
  }

  for (const [identity, entries] of singletonEntries) {
    const group = latestGroupByIdentity.get(identity);
    const eligible = group
      ? entries.filter(
          (entry) => entry.group === group || (!entry.group && entry.order > group.order),
        )
      : entries;
    const winner = eligible.at(-1);
    if (winner) winners.push(winner);
  }

  for (const [collection, entries] of collectionEntries) {
    const group = latestGroupByCollection.get(collection);
    const eligible = group
      ? entries.filter(
          (entry) => entry.group === group || (!entry.group && entry.order > group.order),
        )
      : entries;
    winners.push(...eligible);
  }

  return winners.sort((left, right) => left.order - right.order);
}
