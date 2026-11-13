import type { JSX } from "../types/jsx";

import { NotReadyError } from "../reactivity_new/not-ready-error";
import { runWithOwner, type Owner } from "../life-cycle/owner";
import {
  SSR_ASYNC,
  SSR_COMMENT,
  SSR_DEFERRED,
  SSR_ELEMENT,
  SSR_ERROR_BOUNDARY,
  type SSR_NODE,
  SSR_TEXT,
  resolveNode,
} from "../render/resolve-node";
import {
  joinHTMLElements,
  renderErrorBoundaryRange,
  renderAsyncUtilities,
  renderNode,
  renderText,
} from "./render-to-server.util";

export function resolveSync(App: () => JSX.Element, owner: Owner) {
  function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY) {
    try {
      const children = resolve(node.children());
      node.markResolved();
      return renderErrorBoundaryRange(node.id, children);
    } catch (error) {
      if (error instanceof NotReadyError || !(error instanceof Error)) throw error;

      const fallback = node.renderFallback(error);
      return renderErrorBoundaryRange(node.id, fallback ? resolve(fallback) : "");
    }
  }

  function resolveElement(node: SSR_ELEMENT) {
    return renderNode({
      type: node.type,
      attributes: node.attributes,
      innerHTML: node.innerHTML,
      children: resolve(node.children),
    });
  }

  function resolve(nodes: SSR_NODE[]) {
    const html: string[] = [];

    for (const node of nodes.flat(Infinity).filter(Boolean)) {
      if (node instanceof SSR_ASYNC) {
        // Sync SSR never waits for async work. It can only render its fallback.
        html.push(resolve(node.fallback()));
        continue;
      }

      if (node instanceof SSR_DEFERRED) {
        continue;
      }

      if (node instanceof SSR_ERROR_BOUNDARY) {
        html.push(resolveErrorBoundary(node));
        continue;
      }

      if (node instanceof SSR_TEXT) {
        html.push(renderText(node));
        continue;
      }

      if (node instanceof SSR_COMMENT) {
        html.push(`<!--${node.value}-->`);
        continue;
      }

      if (node instanceof SSR_ELEMENT) {
        html.push(resolveElement(node));
      }
    }

    return joinHTMLElements(html);
  }

  const app = resolveNode(App) as unknown as SSR_NODE[];
  const html = resolve(app);
  const utilities = runWithOwner(owner, renderAsyncUtilities);

  return html + utilities;
}
