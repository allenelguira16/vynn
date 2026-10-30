import { isServer } from "../context/is-server-context";
import {
  getHeadContext,
  getHeadIdentity,
  getHeadWinners,
  notifyHeadContext,
  peekHeadContext,
  type HeadContext,
  type HeadEntry,
  type HeadTag,
} from "../context/head-context";
import { getOwner } from "../life-cycle/owner";
import { createSSRNode, type SSR_ELEMENT } from "./resolve-node";

type HeadElement = HTMLElement | SSR_ELEMENT;

const headElements = new WeakSet<object>();

function getClientIdentity(entry: HeadEntry): string {
  const element = entry.element as HTMLElement;

  return getHeadIdentity(
    element.tagName.toLowerCase() as HeadTag,
    (name) => element.getAttribute(name),
    entry.order,
  );
}

function getCandidateIdentity(
  element: HTMLElement,
  tag: HeadTag,
): string {
  return getHeadIdentity(
    tag,
    (name) => element.getAttribute(name),
    -1,
  );
}

function takeHeadCandidate(
  context: HeadContext,
  tag: HeadTag,
  identity?: string,
): HTMLElement | undefined {
  const candidates = context.candidates.get(tag);
  if (!candidates?.length) return undefined;

  const targetIdentity = identity ?? (tag === "title" ? "title" : undefined);

  if (targetIdentity) {
    const matches = candidates.filter(
      (candidate) =>
        candidate.getAttribute("data-vynn-head") === targetIdentity ||
        getCandidateIdentity(candidate, tag) === targetIdentity,
    );

    // Prefer the SSR-managed node when the HTML shell also contains a
    // matching static tag. This preserves the exact node used by hydration.
    const existing =
      matches.find((candidate) => candidate.hasAttribute("data-vynn-head")) ??
      matches[0];

    if (existing) {
      for (const duplicate of matches) {
        const index = candidates.indexOf(duplicate);
        if (index !== -1) candidates.splice(index, 1);
        if (duplicate !== existing) duplicate.remove();
      }

      const index = candidates.indexOf(existing);
      if (index !== -1) candidates.splice(index, 1);
      return existing;
    }

    return undefined;
  }

  // Dynamic meta/link attributes cannot be matched until attributes have
  // been applied, so only reuse an existing Vynn-managed node in that case.
  const managedIndex = candidates.findIndex((candidate) =>
    candidate.hasAttribute("data-vynn-head"),
  );

  return managedIndex === -1
    ? undefined
    : candidates.splice(managedIndex, 1)[0];
}

function syncClientHead(context: HeadContext): void {
  const winners = new Set(
    getHeadWinners(context, getClientIdentity),
  );

  for (const entry of context.entries) {
    const element = entry.element as HTMLElement;

    if (!winners.has(entry) && element.parentNode === document.head) {
      element.remove();
    }
  }

  for (const entry of winners) {
    const element = entry.element as HTMLElement;

    element.setAttribute("data-vynn-head", getClientIdentity(entry));

    if (element.parentNode !== document.head) {
      document.head.append(element);
    }
  }
}

/**
 * Creates a head element without consuming the application's normal
 * hydration element queue.
 */
export function $headTmpl<T extends HeadTag>(
  tag: T,
  identity?: string,
): HTMLElementTagNameMap[T] {
  const context = getHeadContext();
  context.buildingHeadElements++;

  if (isServer()) {
    return createSSRNode(tag) as unknown as HTMLElementTagNameMap[T];
  }

  const existing = takeHeadCandidate(context, tag, identity);
  if (existing) return existing as HTMLElementTagNameMap[T];

  return document.createElement(tag) as HTMLElementTagNameMap[T];
}

/**
 * Registers metadata with the current render root. Client registrations are
 * synchronized with document.head and follow their owner's lifetime.
 */
export function $head<T extends HeadElement>(element: T): T {
  const context = getHeadContext();
  const entry: HeadEntry = {
    element,
    order: context.nextOrder++,
  };

  headElements.add(element);
  context.entries.push(entry);

  if (context.buildingHeadElements > 0) {
    context.buildingHeadElements--;
  }

  if (isServer()) {
    notifyHeadContext(context);
    return element;
  }

  syncClientHead(context);

  getOwner()?.cleanups.push(() => {
    const index = context.entries.indexOf(entry);
    if (index !== -1) context.entries.splice(index, 1);

    const node = entry.element as HTMLElement;
    if (node.parentNode === document.head) node.remove();

    syncClientHead(context);
  });

  return element;
}

/** Whether JSX is currently constructing the children of a head element. */
export function isCreatingHeadElement(): boolean {
  return (peekHeadContext()?.buildingHeadElements ?? 0) > 0;
}

/** Resolves head children without consuming the application's hydration text queue. */
export function runWithHeadElementContext<T>(callback: () => T): T {
  const context = getHeadContext();
  context.buildingHeadElements++;

  try {
    return callback();
  } finally {
    context.buildingHeadElements--;
  }
}

/** Returns true when a value is a registered document-head element. */
export function isHeadElement(value: unknown): boolean {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  )
    ? headElements.has(value as object)
    : false;
}
