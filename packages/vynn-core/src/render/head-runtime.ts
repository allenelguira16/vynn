import {
  type HeadContext,
  type HeadEntry,
  type HeadGroup,
  type HeadTag,
  getHeadCollectionIdentity,
  getHeadContext,
  getHeadIdentity,
  getHeadWinners,
  getReplacedHeadCollections,
  notifyHeadContext,
} from "../context/head-context";

import {
  createOwner,
  disposeOwner,
  getContext,
  getOwner,
  runWithOwner,
  setContext,
} from "../life-cycle/owner";
import { $renderEffect } from "../reactivity/effect";
import { assertSafeAttributeName } from "./attribute-name";

const HEAD_GROUP_CONTEXT = Symbol.for("vynn.head-group-context");
const HEAD_ELEMENT_CREATION_CONTEXT = Symbol.for("vynn.head-element-creation");

/**
 * Returns whether the current render is producing text for document metadata.
 * Such text is serialized into the head registry, not claimed from body HTML.
 */
export function isCreatingHeadElement(): boolean {
  return getContext<boolean>(HEAD_ELEMENT_CREATION_CONTEXT) === true;
}

/**
 * Temporarily marks synchronous child evaluation as head metadata creation.
 * The marker is stored on the current owner so nested components inherit it.
 */
export function withHeadElementCreation<T>(callback: () => T): T {
  const owner = getOwner();
  if (!owner) return callback();

  const hadOwnValue = owner.context.has(HEAD_ELEMENT_CREATION_CONTEXT);
  const previousValue = owner.context.get(HEAD_ELEMENT_CREATION_CONTEXT);
  owner.context.set(HEAD_ELEMENT_CREATION_CONTEXT, true);

  try {
    return callback();
  } finally {
    if (hadOwnValue) {
      owner.context.set(HEAD_ELEMENT_CREATION_CONTEXT, previousValue);
    } else {
      owner.context.delete(HEAD_ELEMENT_CREATION_CONTEXT);
    }
  }
}

export type HeadProps = Record<string, unknown>;
export type HeadPropsInput = HeadProps | (() => HeadProps);

const booleanAttributes = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

const voidElements = new Set(["meta", "link"]);

const headElements = new WeakMap<HeadEntry, HTMLElement>();

function normalizeHeadAttributeName(name: string): string {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  return name.toLowerCase();
}

function serializeHeadStyle(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);

  return Object.entries(value)
    .filter(([, entry]) => entry != null && entry !== "")
    .map(([property, entry]) => {
      const name =
        property === "cssFloat"
          ? "float"
          : property.startsWith("--")
            ? property
            : property.replace(/[A-Z]/g, (character) => "-" + character.toLowerCase());
      return name + ":" + String(entry).trim();
    })
    .join(";");
}

function toHeadText(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "function") {
    return toHeadText((value as () => unknown)());
  }
  if (Array.isArray(value)) {
    return value.map(toHeadText).join("");
  }
  if (typeof value === "object") {
    if ("textContent" in value) {
      return String((value as { textContent?: unknown }).textContent ?? "");
    }
    if ("value" in value && typeof (value as { value?: unknown }).value === "string") {
      return (value as { value: string }).value;
    }
    if ("children" in value && Array.isArray((value as { children?: unknown }).children)) {
      return toHeadText((value as { children: unknown[] }).children);
    }
  }
  return "";
}

function readHeadEntry(
  tag: HeadTag,
  props: HeadProps,
  order: number,
  group?: HeadGroup,
): HeadEntry {
  const attributes: Record<string, string> = {};
  let children = "";
  let explicitKey: string | undefined;

  for (const name of Object.keys(props)) {
    if (name === "children") {
      children = toHeadText(props[name]);
      continue;
    }

    if (name === "ref" || /^on[A-Z]/.test(name)) continue;

    let value = props[name];
    if (typeof value === "function") value = (value as () => unknown)();

    if (name === "key") {
      if (value != null && value !== false) explicitKey = String(value);
      continue;
    }

    if (value == null) continue;

    const attribute = normalizeHeadAttributeName(name);
    assertSafeAttributeName(attribute);

    if (attribute === "style") {
      const style = serializeHeadStyle(value);
      if (style) attributes[attribute] = style;
      continue;
    }

    if (typeof value === "boolean" && booleanAttributes.has(attribute)) {
      if (value) attributes[attribute] = "";
      continue;
    }

    attributes[attribute] = String(value);
  }

  const collection = getHeadCollectionIdentity(tag, (name) => attributes[name] ?? null);
  const baseIdentity = getHeadIdentity(tag, (name) => attributes[name] ?? null, order);
  const identity = collection
    ? `${baseIdentity}:entry:${order}`
    : explicitKey
      ? tag === "title"
        ? "title"
        : `${tag}:key:${explicitKey}`
      : baseIdentity;

  return {
    tag,
    attributes,
    children,
    identity,
    order,
    ...(collection ? { collection: collection.key, collectionRoot: collection.root } : {}),
    ...(group ? { group } : {}),
  };
}

function getCandidateIdentity(element: HTMLElement, tag: HeadTag): string {
  return getHeadIdentity(tag, (name) => element.getAttribute(name), -1);
}

function takeHeadCandidate(
  context: HeadContext,
  tag: HeadTag,
  identity: string,
): HTMLElement | undefined {
  const candidates = context.candidates.get(tag);
  if (!candidates?.length) return undefined;

  // Only adopt an SSR-managed node. Unkeyed shell metadata is kept intact so
  // it can be restored when the overriding component or group is disposed.
  const matches = candidates.filter(
    (candidate) =>
      candidate.parentNode === document.head && candidate.getAttribute("key") === identity,
  );
  if (matches.length === 0) return undefined;

  const existing = matches[0];

  for (const candidate of matches) {
    const index = candidates.indexOf(candidate);
    if (index !== -1) candidates.splice(index, 1);
    if (candidate !== existing) candidate.remove();
  }

  return existing;
}

function restoreHeadCandidate(context: HeadContext, candidate: HTMLElement): void {
  if (candidate.parentNode === document.head) return;

  if (candidate.parentNode?.nodeType === 11) {
    document.head.append(candidate);
    const fallback =
      context.fallbackTemplate ??
      document.head.querySelector("template[data-vynn-head-fallback]");
    if (fallback && fallback.content.childNodes.length === 0) fallback.remove();
    context.fallbackTemplate = null;
    return;
  }

  const index = context.initialNodes.indexOf(candidate);
  for (let next = index + 1; next < context.initialNodes.length; next++) {
    const sibling = context.initialNodes[next];
    if (sibling.parentNode === document.head) {
      document.head.insertBefore(candidate, sibling);
      return;
    }
  }

  document.head.append(candidate);
}

function syncStaticHeadCandidates(
  context: HeadContext,
  winners: HeadEntry[],
): void {
  const managed = new Set<HTMLElement>();
  for (const entry of context.entries) {
    const element = headElements.get(entry);
    if (element) managed.add(element);
  }

  const singletonIdentities = new Set(
    winners.filter((entry) => !entry.collection).map((entry) => entry.identity),
  );
  const replacedCollections = getReplacedHeadCollections(context);

  for (const tag of ["title", "meta", "link"] as const) {
    for (const candidate of context.candidates.get(tag) ?? []) {
      if (managed.has(candidate)) continue;

      const identity = getCandidateIdentity(candidate, tag);
      const collection = getHeadCollectionIdentity(
        tag,
        (name) => candidate.getAttribute(name),
      );
      const matchingSsrSingleton =
        !collection &&
        singletonIdentities.has(identity) &&
        candidate.getAttribute("key") === identity;
      const overridden =
        singletonIdentities.has(identity) ||
        (!!collection && replacedCollections.has(collection.key));

      if (overridden && !matchingSsrSingleton) {
        // SSR keeps overridden static shell metadata in an inert template so
        // it can be restored after a client-side route transition.
        if (candidate.parentNode?.nodeType !== 11) candidate.remove();
      } else {
        restoreHeadCandidate(context, candidate);
      }
    }
  }
}

function applyHeadEntry(element: HTMLElement, entry: HeadEntry): void {
  for (const attribute of Array.from(element.attributes)) {
    element.removeAttribute(attribute.name);
  }

  for (const [name, value] of Object.entries(entry.attributes)) {
    element.setAttribute(name, value);
  }

  element.setAttribute("key", entry.identity);

  if (!voidElements.has(entry.tag)) {
    const nextText = entry.children;
    if (element.textContent !== nextText) element.textContent = nextText;
  }
}

function syncClientHead(context: HeadContext): void {
  if (context.preserveInitialDocument) return;

  const winners = getHeadWinners(context);
  const nextElements = new Map<string, HTMLElement>();

  syncStaticHeadCandidates(context, winners);

  for (const entry of winners) {
    let element =
      context.activeElements.get(entry.identity) ??
      headElements.get(entry) ??
      takeHeadCandidate(context, entry.tag, entry.identity);

    if (!element) element = document.createElement(entry.tag);

    nextElements.set(entry.identity, element);
    headElements.set(entry, element);
    applyHeadEntry(element, entry);

    if (element.parentNode !== document.head) {
      document.head.append(element);
    }
  }

  const retainedElements = new Set(nextElements.values());
  for (const element of context.activeElements.values()) {
    if (!retainedElements.has(element) && element.parentNode === document.head) {
      element.remove();
    }
  }

  context.activeElements.clear();
  for (const [identity, element] of nextElements) {
    context.activeElements.set(identity, element);
  }
}

/** Reconciles active declarations after replacing the document root. */
export function synchronizeHeadContext(context: HeadContext): void {
  if (!import.meta.env.SSR) syncClientHead(context);
}

function removeHeadEntry(context: HeadContext, entry: HeadEntry): void {
  const index = context.entries.indexOf(entry);
  if (index !== -1) context.entries.splice(index, 1);

  if (entry.group) {
    const groupIndex = entry.group.entries.indexOf(entry);
    if (groupIndex !== -1) entry.group.entries.splice(groupIndex, 1);
  }

  const element = headElements.get(entry);
  if (
    !import.meta.env.SSR &&
    element?.parentNode === document.head &&
    context.activeElements.get(entry.identity) !== element
  ) {
    element.remove();
  }

  notifyHeadContext(context);
  if (!import.meta.env.SSR) syncClientHead(context);
}

/**
 * Registers one ordinary document metadata element. Outside a nested <head>,
 * singleton declarations override matching values and Open Graph arrays append.
 * Inside a nested <head>, the entry belongs to that group's replacement scope.
 */
export function $registerHead<T extends HeadTag>(
  tag: T,
  props: HeadPropsInput,
): HeadEntry {
  const context = getHeadContext();
  const group = getContext<HeadGroup>(HEAD_GROUP_CONTEXT);
  const entry: HeadEntry = {
    tag,
    attributes: {},
    children: "",
    identity: tag === "title" ? "title" : `head:${context.nextOrder}`,
    order: context.nextOrder++,
    ...(group ? { group } : {}),
  };

  $renderEffect(() => {
    const next = withHeadElementCreation(() => {
      const definition = typeof props === "function" ? props() : props;
      return readHeadEntry(tag, definition, entry.order, group);
    });
    entry.attributes = next.attributes;
    entry.children = next.children;
    entry.identity = next.identity;
    entry.collection = next.collection;
    entry.collectionRoot = next.collectionRoot;

    if (!context.entries.includes(entry)) context.entries.push(entry);
    if (group && !group.entries.includes(entry)) group.entries.push(entry);

    if (!group?.initializing) {
      notifyHeadContext(context);
      if (!import.meta.env.SSR) syncClientHead(context);
    }
  });

  // SSR registrations must survive render-owner disposal until the document
  // adapter has serialized the final head snapshot.
  if (!import.meta.env.SSR) {
    getOwner()?.cleanups.push(() => removeHeadEntry(context, entry));
  }

  return entry;
}

/**
 * Establishes an atomic replacement scope for metadata declared inside a
 * nested <head>. The nested element itself never becomes a DOM node.
 */
export function $registerHeadGroup(render: () => unknown): [] {
  const context = getHeadContext();
  const group: HeadGroup = {
    order: context.nextOrder++,
    entries: [],
    initializing: true,
  };
  const groupOwner = createOwner(getOwner(), { identity: false });

  context.groups.push(group);

  try {
    runWithOwner(groupOwner, () => {
      setContext(HEAD_GROUP_CONTEXT, group);
      withHeadElementCreation(render);
    });
  } catch (error) {
    const index = context.groups.indexOf(group);
    if (index !== -1) context.groups.splice(index, 1);
    disposeOwner(groupOwner);
    notifyHeadContext(context);
    throw error;
  }

  group.initializing = false;
  notifyHeadContext(context);
  if (!import.meta.env.SSR) syncClientHead(context);

  // The dedicated owner carries group context into nested components and
  // reactive branches, then disposes their declarations as one lifecycle unit.
  // SSR entries intentionally remain in the snapshot after owner disposal.
  if (!import.meta.env.SSR) {
    groupOwner.cleanups.push(() => {
      const index = context.groups.indexOf(group);
      if (index !== -1) context.groups.splice(index, 1);

      for (const entry of [...group.entries]) removeHeadEntry(context, entry);

      notifyHeadContext(context);
      syncClientHead(context);
    });
  }

  return [];
}
