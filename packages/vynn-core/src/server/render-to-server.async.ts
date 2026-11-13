import {
  type SSR_ASYNC,
  type SSR_DEFERRED,
  type SSR_ELEMENT,
  type SSR_ERROR_BOUNDARY,
  type SSR_NODE,
  resolveNode,
  resolveSSRAsyncChildren,
  resolveSSRDeferredChildren,
  SSRBoundaryFailure,
  SSRDeferredError,
  isSSRErrorBoundary,
  isSSRElement,
} from "../render/resolve-node";
import { runWithOwner, type Owner } from "../life-cycle/owner";
import type { JSX } from "../types/jsx";
import {
  getSSRErrorBoundary,
  joinHTMLElements,
  renderAsyncUtilities,
  renderErrorBoundaryRange,
  renderNode,
  renderText,
  withSSRErrorBoundary,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolveAsyncBoundary(node: SSR_ASYNC | SSR_DEFERRED): Promise<string> {
    return withSSRErrorBoundary(node.errorBoundary, async () => {
      const children =
        node.type === "#async"
          ? await resolveSSRAsyncChildren(node)
          : await resolveSSRDeferredChildren(node);

      return resolve(children);
    });
  }

  async function resolveErrorBoundary(node: SSR_ERROR_BOUNDARY): Promise<string> {
    let children: string;

    try {
      children = await resolve(runWithOwner(owner, node.children));
    } catch (error) {
      const boundary = getSSRErrorBoundary(error, node.errorBoundary, node.id);
      children = await resolve(boundary.render());
    }

    return renderErrorBoundaryRange(node.id, children);
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
      if ("promises" in node) {
        html.push(await resolveAsyncBoundary(node));
        continue;
      }

      if (isSSRErrorBoundary(node)) {
        html.push(await resolveErrorBoundary(node));
        continue;
      }

      if ("value" in node) {
        html.push(node.type === "#text" ? renderText(node) : `<!--${node.value}-->`);
        continue;
      }

      if (isSSRElement(node)) {
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
