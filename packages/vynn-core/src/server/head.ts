import {
  getHeadContext,
  getHeadIdentity,
  getHeadWinners,
  subscribeHeadContext,
  type HeadContext,
  type HeadEntry,
  type HeadTag,
} from "../context/head-context";
import { escapeHtml } from "../utils/escape-html";
import type { SSR_ELEMENT, SSR_NODE } from "../render/resolve-node";
import { APPLY_HEAD_PATCH_SSR_KEY } from "../const";

const SSR_RESULT_HEAD_CONTEXT = Symbol.for("vynn.ssr-head-context");
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
    return node.type === "#text"
      ? escapeHtml(node.value)
      : `<!--${node.value}-->`;
  }

  if ("promises" in node) {
    // Deferred metadata is emitted by the streaming head-patch mechanism.
    return "";
  }

  const attributes = serializeAttributes(node.attributes);
  const suffix = attributes ? ` ${attributes}` : "";

  if (voidElements.has(node.type)) return `<${node.type}${suffix}>`;

  return `<${node.type}${suffix}>${node.children
    .map(serializeSsrNode)
    .join("")}</${node.type}>`;
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
  return getHeadWinners(context, getServerIdentity)
    .map(serializeHeadEntry)
    .join("");
}

/** Associates request-local metadata with the Promise or stream returned by SSR. */
export function attachSsrHead<T extends object>(
  result: T,
  // context: HeadContext,
): T {
  // A custom Node server and a Vite-loaded SSR entry can resolve separate
  // instances of this module. A global symbol keeps the request context
  // accessible across those module instances.
  Object.defineProperty(result, SSR_RESULT_HEAD_CONTEXT, {
    configurable: false,
    enumerable: false,
    value: getHeadContext(),
    writable: false,
  });
  return result;
}

function getAttachedHeadContext(result: unknown): HeadContext | undefined {
  if (
    (typeof result !== "object" && typeof result !== "function") ||
    result === null
  ) {
    return undefined;
  }

  return Reflect.get(result, SSR_RESULT_HEAD_CONTEXT) as
    | HeadContext
    | undefined;
}

/** Serializes the metadata collected by a renderToServer() result. */
export function getSsrHead(result: unknown): string {
  const context = getAttachedHeadContext(result);
  return context ? renderSsrHead(context) : "";
}

/** Subscribes to metadata discovered after a streaming SSR shell was emitted. */
export function subscribeSsrHead(
  result: unknown,
  listener: (html: string) => void,
): () => void {
  const context = getAttachedHeadContext(result);
  if (!context) return () => {};

  return subscribeHeadContext(context, () => listener(renderSsrHead(context)));
}

/** Encodes a complete head snapshot as a browser-side patch. */
export function renderHeadPatch(html: string): string {
  const serialized = JSON.stringify(html).replace(/</g, "\\u003c");
  return `<script>${APPLY_HEAD_PATCH_SSR_KEY}(${serialized});document.currentScript.remove();</script>`;
}
