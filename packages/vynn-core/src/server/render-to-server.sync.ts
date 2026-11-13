import type { JSX } from "../types/jsx";

import { getOwner, runWithOwner } from "../life-cycle/owner";
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
  getSSRErrorBoundary,
  joinHTMLElements,
  renderAsyncUtilities,
  renderErrorBoundaryRange,
  renderNode,
  renderText,
} from "./render-to-server.util";

export function resolveSync(App: () => JSX.Element): string {
  const owner = getOwner();

  if (!owner) {
    throw new Error("[vynn]: Synchronous SSR requires an active render owner.");
  }

  function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY): string {
    let children: string;

    try {
      children = resolve(node.children());
    } catch (error) {
      const boundary = getSSRErrorBoundary(error, node.errorBoundary, node.id);
      children = resolve(boundary.render());
    }

    return renderErrorBoundaryRange(node.id, children);
  }

  function resolveElement(node: SSR_ELEMENT): string {
    return renderNode({
      type: node.type,
      attributes: node.attributes,
      innerHTML: node.innerHTML,
      children: resolve(node.children),
    });
  }

  function resolve(nodes: SSR_NODE[]): string {
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
