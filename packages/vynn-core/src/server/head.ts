import { APPLY_HEAD_PATCH_SSR_KEY } from "../const";
import {
  type HeadContext,
  type HeadEntry,
  getHeadWinners,
  subscribeHeadContext,
} from "../context/head-context";
import { assertSafeAttributeName } from "../render/attribute-name";
import { escapeHtml } from "../utils/escape-html";

const voidElements = new Set(["meta", "link"]);

function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => {
      assertSafeAttributeName(name);
      return `${name}="${escapeHtml(value)}"`;
    })
    .join(" ");
}

function serializeHeadEntry(entry: HeadEntry): string {
  const attributes = {
    ...entry.attributes,
    key: entry.identity,
    ...(entry.group && entry.collectionRoot && entry.collection
      ? { "data-vynn-head-replace": entry.collection }
      : {}),
  };
  const serializedAttributes = serializeAttributes(attributes);
  const suffix = serializedAttributes ? ` ${serializedAttributes}` : "";

  if (voidElements.has(entry.tag)) {
    return `<${entry.tag}${suffix}>`;
  }

  return `<${entry.tag}${suffix}>${escapeHtml(entry.children)}</${entry.tag}>`;
}

export function renderSsrHead(context: HeadContext): string {
  return getHeadWinners(context).map(serializeHeadEntry).join("");
}

export interface SsrHeadManager {
  render(): string;
  subscribe(listener: (html: string) => void): () => void;
}

/** Creates an explicit head handle for one SSR render. */
export function createSsrHeadManager(context: HeadContext): SsrHeadManager {
  const render = () => {
    return getHeadWinners(context).map(serializeHeadEntry).join("");
  };

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
