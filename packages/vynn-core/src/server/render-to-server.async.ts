import { runWithOwner, type Owner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity/not-ready-error";
import {
  type SSR_NODE,
  resolveNode,
  resolveSSRAsyncChildren,
  resolveSSRDeferredChildren,
  SSRBoundaryFailure,
  SSRDeferredError,
  isSSRErrorBoundary,
  isSSRElement,
} from "../render/resolve-node";
import { JSX } from "../types/jsx";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderErrorBoundaryRange,
  renderNode,
  renderText,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node && node.type === "#async") {
        try {
          const children = await resolveSSRAsyncChildren(node);
          html.push(await resolve(children));
        } catch (error) {
          if (
            error instanceof SSRDeferredError ||
            error instanceof SSRBoundaryFailure ||
            error instanceof NotReadyError
          ) {
            throw error;
          }

          if (error instanceof Error && node.errorBoundary) {
            throw new SSRBoundaryFailure(error, node.errorBoundary);
          }

          throw error;
        }
      } else if ("promises" in node && node.type === "#deferred") {
        let children: SSR_NODE[];

        try {
          children = await resolveSSRDeferredChildren(node);
        } catch (error) {
          if (
            error instanceof SSRDeferredError ||
            error instanceof SSRBoundaryFailure ||
            error instanceof NotReadyError
          ) {
            throw error;
          }

          if (error instanceof Error && node.errorBoundary) {
            throw new SSRBoundaryFailure(error, node.errorBoundary);
          }

          throw error;
        }

        try {
          html.push(await resolve(children));
        } catch (error) {
          if (
            error instanceof SSRDeferredError ||
            error instanceof SSRBoundaryFailure ||
            error instanceof NotReadyError
          ) {
            throw error;
          }

          if (error instanceof Error && node.errorBoundary) {
            throw new SSRBoundaryFailure(error, node.errorBoundary);
          }

          throw error;
        }
      } else if (isSSRErrorBoundary(node)) {
        let children: string;

        try {
          children = await resolve(runWithOwner(owner, node.children));
        } catch (error) {
          let boundary: import("../context/error-boundary-context").ErrorBoundary;

          if (error instanceof SSRBoundaryFailure) {
            boundary = error.handled ? error.boundary : error.boundary.handle(error.reason);

            if (boundary.id !== node.id) {
              throw new SSRBoundaryFailure(error.reason, boundary, true);
            }
          } else if (error instanceof Error) {
            boundary = node.errorBoundary.handle(error);

            if (boundary.id !== node.id) {
              throw new SSRBoundaryFailure(error, boundary, true);
            }
          } else {
            throw error;
          }

          children = await resolve(boundary.render());
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
            children: await resolve(node.children),
          }),
        );
      }
    }

    return joinHTMLElements(html);
  }

  try {
    const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
    const resolved = await resolve(app);
    const utilities = runWithOwner(owner, renderAsyncUtilities);

    return resolved + utilities;
  } catch (error) {
    if (error instanceof SSRDeferredError) throw error.reason;
    if (error instanceof SSRBoundaryFailure) throw error.reason;
    throw error;
  }
}
