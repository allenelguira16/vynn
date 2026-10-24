import { disposeOwner, getOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import {
  joinHTMLElements,
  renderNode,
  renderText,
} from "./render-to-server.util";
import { resolveNode, SSR_NODE } from "./resolve-node";

export function resolveSync(App: () => JSX.Element) {
  const owner = getOwner()!;

  function resolve(app: SSR_NODE[]): string {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node) {
        // console.log(node.children());
        // DO NOTHING
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
    return (
      resolve(resolveNode(App) as unknown as SSR_NODE[]) +
      `<script>window.__vynnAsyncData = [];window.__vynnRenderMode="${owner.context.get("$render-mode")}";document.currentScript.remove();</script>`
    );
  } finally {
    const owner = getOwner();
    if (owner) disposeOwner(owner);
  }
}
