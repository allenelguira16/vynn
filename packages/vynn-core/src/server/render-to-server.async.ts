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
  SSRBoundaryFailure,
  SSRDeferredError,
  resolveSSRAsyncChildren,
  resolveSSRDeferredChildren,
} from "../render/resolve-node";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderErrorBoundaryRange,
  renderNode,
  renderText,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolveAsyncBoundary(node: SSR_ASYNC | SSR_DEFERRED): Promise<string> {
    const children =
      node instanceof SSR_ASYNC
        ? await resolveSSRAsyncChildren(node)
        : await resolveSSRDeferredChildren(node);

    return await resolve(children);
  }

  async function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY): Promise<string> {
    if (node.error) {
      return renderErrorBoundaryRange(node.id, await resolve(node.fallback(node.error)));
    }

    try {
      const children = await resolve(node.children());
      const error = node.error;

      return renderErrorBoundaryRange(
        node.id,
        error ? await resolve(node.fallback(error)) : children,
      );
    } catch (caught) {
      let error: unknown = caught;

      if (error instanceof NotReadyError) {
        try {
          await error.promise;
          return resolveErrorBoundary(node);
        } catch (reason) {
          error = reason;
        }
      }

      if (!(error instanceof Error)) throw error;

      node.handleError(error);

      return renderErrorBoundaryRange(node.id, await resolve(node.fallback(error)));
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
