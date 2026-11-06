import {
  APPLY_PATCH_SSR_KEY,
  ASYNC_DATA_SSR_KEY,
  EMPTY_TEXT_SSR_MARKER,
  ERROR_BOUNDARY_DATA_SSR_KEY,
  TEXT_SSR_SEPARATOR,
} from "../const";
import { getAsyncValues } from "../context/async-context";
import { getErrorBoundaryValues } from "../context/error-boundary-context";
import { getRenderMode } from "../context/render-mode";
import { SSR_ELEMENT, SSR_TEXT } from "../render/resolve-node";
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

export function renderText(node: SSR_TEXT) {
  return node.value === "" ? `<!--${EMPTY_TEXT_SSR_MARKER}-->` : escapeHtml(node.value);
}

export function renderNode(props: {
  type: string;
  attributes: SSR_ELEMENT["attributes"];
  children: string;
}) {
  let attributes = Object.entries(props.attributes)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
  attributes = attributes ? ` ${attributes}` : "";

  if (voidElements.has(props.type)) {
    if (props.children.length > 0) {
      console.warn(
        `[vynn]: <${props.type}> is a void element and cannot have children therefore it will ignore the children`,
      );
    }

    return `<${props.type}${attributes}>`;
  } else {
    return `<${props.type}${attributes}>${props.children}</${props.type}>`;
  }
}

export function joinHTMLElements(html: string[]): string {
  const result: string[] = [];

  for (let i = 0; i < html.length; i++) {
    const current = html[i];
    const next = html[i + 1];

    result.push(current);

    if (current && next && hasNoHTMLTags(current) && hasNoHTMLTags(next)) {
      result.push(`<!--${TEXT_SSR_SEPARATOR}-->`);
    }
  }

  return result.join("");
}

export function hasNoHTMLTags(str: string) {
  // Matches anything inside <...>
  const htmlTagRegex = /<[^>]+>/g;
  return !htmlTagRegex.test(str);
}

export function renderAsyncUtilities() {
  const asyncValues = getAsyncValues();
  const errorValues = getErrorBoundaryValues();

  // Empty hydration registries need no client bootstrap script. The client
  // readers already handle missing globals, so keep plain SSR output free of
  // an otherwise empty inline script.
  if (
    (!asyncValues || Object.keys(asyncValues).length === 0) &&
    (!errorValues || errorValues.length === 0)
  ) {
    return "";
  }

  const values = {
    async: serializeForInlineScript(asyncValues),
    mode: serializeForInlineScript(getRenderMode()),
    error: serializeForInlineScript(errorValues),
  };
  return `<script>${ASYNC_DATA_SSR_KEY}=${values.async};${ERROR_BOUNDARY_DATA_SSR_KEY}=${values.error};document.currentScript.remove();</script>`.replaceAll(
    "\n",
    "",
  );
}

function serializeForInlineScript(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Appends portal HTML to a target that is outside the currently-resolved
 * async branch. A MutationObserver handles targets that appear later in the
 * streamed document.
 */
export function renderPortalPatch(id: number, selector: string, html: string): string {
  const templateId = `vynn-portal-${id}`;
  const selectorJSON = JSON.stringify(selector).replace(/</g, "\\\\u003c");

  return `<template id="${templateId}">${html}</template><script>(function(){var p=document.getElementById(${JSON.stringify(templateId)}),s=${selectorJSON};function a(){var t=document.querySelector(s);if(!t||!p)return!1;t.append(p.content);p.remove();var f=window.${APPLY_PATCH_SSR_KEY};if(f)f(null);return!0}if(!a()){var o=new MutationObserver(function(){if(a())o.disconnect()});o.observe(document.documentElement,{childList:!0,subtree:!0})}document.currentScript.remove()})();</script>`;
}
