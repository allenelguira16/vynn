import type { JSX } from "../types/jsx";

import { runWithOwner, type Owner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";
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
  renderAsyncUtilities,
  renderNode,
  renderErrorBoundaryRange,
  renderText,
} from "./render-to-server.util";

export function resolveSync(App: () => JSX.Element, owner: Owner) {
  function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY) {
    try {
      return renderErrorBoundaryRange(node.id, resolve(node.children()));
    } catch (error) {
      // Sync SSR never waits for pending resources. A later async render mode
      // can retry the same boundary after its pending promise settles.
      if (error instanceof NotReadyError) {
        return renderErrorBoundaryRange(node.id, "");
      }

      if (!(error instanceof Error)) throw error;

      node.handleError(error);
      return renderErrorBoundaryRange(node.id, resolve(node.fallback(error)));
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
