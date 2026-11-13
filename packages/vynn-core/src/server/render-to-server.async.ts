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
  SSRBoundaryFailure,
  SSRDeferredError,
} from "../render/resolve-node";
import {
  joinHTMLElements,
  renderErrorBoundaryRange,
  renderAsyncUtilities,
  renderNode,
  renderText,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolveAsyncBoundary(node: SSR_ASYNC | SSR_DEFERRED): Promise<string> {
    try {
      await Promise.all(node.promises);
      return await resolve(node.children());
    } catch (error) {
      // Blocking deferred work (such as a route guard) is control flow, not
      // a render error that an ErrorBoundary should turn into fallback UI.
      if (node instanceof SSR_DEFERRED && node.blocking) {
        throw new SSRDeferredError(error);
      }

      throw error;
    }
  }

  async function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY): Promise<string> {
    try {
      const children = await resolve(node.children());
      node.markResolved();
      return renderErrorBoundaryRange(node.id, children);
    } catch (error) {
      if (
        error instanceof SSRDeferredError ||
        error instanceof NotReadyError ||
        !(error instanceof Error)
      ) {
        throw error;
      }

      const fallback = node.renderFallback(error);
      const html = fallback ? await resolve(fallback) : "";
      return renderErrorBoundaryRange(node.id, html);
    }
  }

  async function resolveElement(node: SSR_ELEMENT): Promise<string> {
    const children = await resolve(node.children);

    return renderNode({
      type: node.type,
      attributes: node.attributes,
      innerHTML: node.innerHTML,
      children,
    });
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if (node instanceof SSR_ASYNC || node instanceof SSR_DEFERRED) {
        html.push(await resolveAsyncBoundary(node));
        continue;
      }

      if (node instanceof SSR_ERROR_BOUNDARY) {
        html.push(await resolveErrorBoundary(node));
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
        html.push(await resolveElement(node));
      }
    }

    return joinHTMLElements(html);
  }

  try {
    const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
    const html = await resolve(app);
    const utilities = runWithOwner(owner, renderAsyncUtilities);

    return html + utilities;
  } catch (error) {
    if (error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure) {
      throw error.reason;
    }

    throw error;
  }
}
