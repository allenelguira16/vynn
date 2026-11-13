import type { JSX } from "../types/jsx";

import { getOwner, runWithOwner } from "../life-cycle/owner";
import {
  type SSR_ELEMENT,
  type SSR_ERROR_BOUNDARY,
  type SSR_NODE,
  isSSRErrorBoundary,
  isSSRElement,
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
      if ("promises" in node) {
        // Sync SSR never waits for async work. It can only render its fallback.
        if (node.type === "#async") {
          html.push(resolve(node.fallback()));
        }

        continue;
      }

      if (isSSRErrorBoundary(node)) {
        html.push(resolveErrorBoundary(node));
        continue;
      }

      if ("value" in node) {
        html.push(node.type === "#text" ? renderText(node) : `<!--${node.value}-->`);
        continue;
      }

      if (isSSRElement(node)) {
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
