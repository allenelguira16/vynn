import { disposeOwner, getOwner, runWithOwner } from "../life-cycle/owner";
import type { JSX } from "../types/jsx";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderNode,
  renderText,
} from "./render-to-server.util";
import { resolveNode, type SSR_NODE } from "../render/resolve-node";

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
      } else if ("value" in node && node.type === "#text") {
        html.push(renderText(node));
      } else if ("value" in node && node.type === "#comment") {
        html.push(`<!--${node.value}-->`);
      } else if ("children" in node) {
        html.push(
          renderNode({
            type: node.type,
            attributes: node.attributes,
            children: resolve(node.children),
          }),
        );
      }
    }

    return joinHTMLElements(html);
  }

  try {
    const html = resolve(resolveNode(App) as unknown as SSR_NODE[]);
    return html + runWithOwner(owner, renderAsyncUtilities);
  } finally {
    disposeOwner(owner);
  }
}
