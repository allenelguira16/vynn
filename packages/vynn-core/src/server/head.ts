import type { SSR_ELEMENT, SSR_NODE } from "../render/resolve-node";

import { APPLY_HEAD_PATCH_SSR_KEY } from "../const";
import {
  type HeadContext,
  type HeadEntry,
  type HeadTag,
  getHeadIdentity,
  getHeadWinners,
  subscribeHeadContext,
} from "../context/head-context";
import { escapeHtml } from "../utils/escape-html";

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

function getServerIdentity(entry: HeadEntry): string {
  const element = entry.element as SSR_ELEMENT;

  return getHeadIdentity(
    element.type as HeadTag,
    (name) => element.attributes[name] ?? null,
    entry.order,
  );
}

function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
}

function serializeSsrNode(node: SSR_NODE): string {
  if ("value" in node) {
    return node.type === "#text" ? escapeHtml(node.value) : `<!--${node.value}-->`;
  }

  if ("promises" in node) {
    // Deferred metadata is emitted by the streaming head-patch mechanism.
    return "";
  }

  const attributes = serializeAttributes(node.attributes);
  const suffix = attributes ? ` ${attributes}` : "";

  if (voidElements.has(node.type)) return `<${node.type}${suffix}>`;

  return `<${node.type}${suffix}>${node.children.map(serializeSsrNode).join("")}</${node.type}>`;
}

function serializeHeadEntry(entry: HeadEntry): string {
  const element = entry.element as SSR_ELEMENT;
  const attributes = {
    ...element.attributes,
    key: getServerIdentity(entry),
  };
  const serializedAttributes = serializeAttributes(attributes);
  const suffix = serializedAttributes ? ` ${serializedAttributes}` : "";

  if (voidElements.has(element.type)) {
    return `<${element.type}${suffix}>`;
  }

  return `<${element.type}${suffix}>${element.children
    .map(serializeSsrNode)
    .join("")}</${element.type}>`;
}

export function renderSsrHead(context: HeadContext): string {
  return getHeadWinners(context, getServerIdentity).map(serializeHeadEntry).join("");
}

export interface SsrHeadManager {
  render(): string;
  subscribe(listener: (html: string) => void): () => void;
}

/** Creates an explicit head handle for one SSR render. */
export function createSsrHeadManager(context: HeadContext): SsrHeadManager {
  const render = () => renderSsrHead(context);

  return {
    render,
    subscribe(listener) {
      return subscribeHeadContext(context, () => listener(render()));
    },
  };
}

/** Encodes a complete head snapshot as a browser-side patch. */
export function renderHeadPatch(html: string): string {
  const serialized = JSON.stringify(html).replace(/</g, "\\u003c");
  return `<script>${APPLY_HEAD_PATCH_SSR_KEY}(${serialized});document.currentScript.remove();</script>`;
}
