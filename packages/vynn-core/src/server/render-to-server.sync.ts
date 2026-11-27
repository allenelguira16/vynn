import type { JSX } from "../types/jsx";

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
  flattenSSRNodes,
  joinHTMLElements,
  renderAsyncUtilities,
  renderComment,
  renderElement,
  renderErrorBoundarySync,
  renderText,
} from "./render-to-server.util";

export function resolveSync(App: () => JSX.Element, owner: Owner) {
  function resolve(nodes: SSR_NODE[]) {
    const html: string[] = [];

    for (const node of flattenSSRNodes(nodes)) {
      if (node instanceof SSR_ASYNC) {
        // Sync SSR never waits for async work. It can only render its fallback.
        html.push(resolve(node.fallback()));
        continue;
      }

      if (node instanceof SSR_DEFERRED) {
        continue;
      }

      if (node instanceof SSR_ERROR_BOUNDARY) {
        html.push(renderErrorBoundarySync(node, resolve));
        continue;
      }

      if (node instanceof SSR_TEXT) {
        html.push(renderText(node));
        continue;
      }

      if (node instanceof SSR_COMMENT) {
        html.push(renderComment(node));
        continue;
      }

      if (node instanceof SSR_ELEMENT) {
        html.push(renderElement(node, resolve(node.children)));
      }
    }

    return joinHTMLElements(html);
  }

  const app = resolveNode(App) as unknown as SSR_NODE[];
  const html = resolve(app);
  const utilities = runWithOwner(owner, renderAsyncUtilities);

  return html + utilities;
}
