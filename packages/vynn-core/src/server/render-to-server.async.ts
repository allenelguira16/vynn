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
  SSRBoundaryFailure,
  SSRDeferredError,
} from "../render/resolve-node";
import {
  createSSRUtilitiesRenderer,
  joinHTMLElements,
  renderErrorBoundaryRange,
  renderNode,
  renderText,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolveAsyncBoundary(node: SSR_ASYNC | SSR_DEFERRED): Promise<string> {
    await Promise.all(node.promises);
    return await resolve(node.withOwner(node.children));
  }

  async function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY): Promise<string> {
    let childrenHTML: string;

    try {
      childrenHTML = await resolve(node.children());
    } catch (error) {
      const reason =
        error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure
          ? error.reason
          : error;

      if (!(reason instanceof Error)) throw reason;

      if (!node.hasError && !node.handle(reason)) throw reason;
      if (node.error !== reason) throw reason;
    }

    if (node.error) {
      return renderErrorBoundaryRange(node.id, await resolve(node.fallback(node.error)));
    }

    return renderErrorBoundaryRange(node.id, childrenHTML!);
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
    const renderUtilities = runWithOwner(owner, createSSRUtilitiesRenderer);
    const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
    const html = await resolve(app);

    return html + renderUtilities();
  } catch (error) {
    if (error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure) {
      throw error.reason;
    }

    throw error;
  }
}
