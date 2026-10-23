import { disposeOwner, getCurrentOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { escapeHtml } from "../utils/escape-html";
import { joinHTMLElements, renderNode } from "./render-to-server.util";
import { resolveNode, SSR_NODE } from "./resolve-node";

export function resolveSync(App: () => JSX.Element) {
  const owner = getCurrentOwner()!;

  function resolve(app: SSR_NODE[]): string {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node) {
        // console.log(node.children());
        // DO NOTHING
      } else if ("value" in node && node.type === "#text") {
        html.push(
          node.value === "" ? "<!--vynn:text-->" : escapeHtml(node.value),
        );
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
    const owner = getCurrentOwner();
    if (owner) disposeOwner(owner);
  }
}
