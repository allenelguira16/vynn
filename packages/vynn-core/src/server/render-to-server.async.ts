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
  renderErrorBoundaryAsync,
  renderText,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolveAsyncBoundary(node: SSR_ASYNC | SSR_DEFERRED): Promise<string> {
    if (node instanceof SSR_DEFERRED && node.blocking) {
      await Promise.all(node.promises);
    } else {
      await Promise.allSettled(node.promises);
    }

    return await resolve(node.children());
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];

    for (const node of flattenSSRNodes(app)) {
      if (node instanceof SSR_ASYNC || node instanceof SSR_DEFERRED) {
        html.push(await resolveAsyncBoundary(node));
        continue;
      }

      if (node instanceof SSR_ERROR_BOUNDARY) {
        html.push(await renderErrorBoundaryAsync(node, resolve));
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
        html.push(renderElement(node, await resolve(node.children)));
      }
    }

    return joinHTMLElements(html);
  }

  const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
  const html = await resolve(app);
  const utilities = runWithOwner(owner, renderAsyncUtilities);

  return html + utilities;
}
