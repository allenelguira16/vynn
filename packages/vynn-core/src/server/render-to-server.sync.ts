import type { JSX } from "../types/jsx";

import { getOwner, runWithOwner } from "../life-cycle/owner";
import {
  type SSR_NODE,
  SSRBoundaryFailure,
  isSSRErrorBoundary,
  isSSRElement,
  resolveNode,
} from "../render/resolve-node";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderNode,
  renderText,
  renderErrorBoundaryRange,
} from "./render-to-server.util";

export function resolveSync(App: () => JSX.Element): string {
  const owner = getOwner();
  if (!owner) {
    throw new Error("[vynn]: Synchronous SSR requires an active render owner.");
  }

  function resolve(app: SSR_NODE[]): string {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node) {
        if (node.type === "#async") html.push(resolve(node.fallback()));
      } else if (isSSRErrorBoundary(node)) {
        let children: string;

        try {
          children = resolve(node.children());
        } catch (error) {
          if (error instanceof SSRBoundaryFailure) {
            const boundary = error.handled
              ? error.boundary
              : error.boundary.handle(error.reason);

            if (boundary.id !== node.id) {
              throw new SSRBoundaryFailure(error.reason, boundary, true);
            }

            children = resolve(boundary.render());
          } else if (error instanceof Error) {
            const boundary = node.errorBoundary.handle(error);
            if (boundary.id !== node.id) {
              throw new SSRBoundaryFailure(error, boundary, true);
            }

            children = resolve(boundary.render());
          } else {
            throw error;
          }
        }

        html.push(renderErrorBoundaryRange(node.id, children));
      } else if ("value" in node && node.type === "#text") {
        html.push(renderText(node));
      } else if ("value" in node && node.type === "#comment") {
        html.push(`<!--${node.value}-->`);
      } else if (isSSRElement(node)) {
        html.push(
          renderNode({
            type: node.type,
            attributes: node.attributes,
            innerHTML: node.innerHTML,
            children: resolve(node.children),
          }),
        );
      }
    }

    return joinHTMLElements(html);
  }

  const html = resolve(resolveNode(App) as unknown as SSR_NODE[]);
  return html + runWithOwner(owner, renderAsyncUtilities);
}
