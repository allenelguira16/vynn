import { disposeOwner, getCurrentOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { escapeHtml } from "../utils/escape-html";
import {
  hasNoHTMLTags,
  joinHTMLElements,
  renderNode,
} from "./render-to-server.util";
import { resolveNode, SSR_NODE } from "./resolve-node";

export async function resolveAsync(App: () => JSX.Element): Promise<string> {
  const owner = getCurrentOwner()!;

  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node && node.type === "#async") {
        await Promise.all(node.promises);

        html.push(await resolve(node.children()));
      } else if ("promises" in node && node.type === "#deferred") {
        await Promise.all(node.promises);

        html.push(await resolve(node.children()));
      } else if ("value" in node && node.type === "#text") {
        html.push(
          node.value === "" ? "<!--vynn:text-->" : escapeHtml(node.value),
        );
      } else if ("value" in node && node.type === "#comment") {
        html.push(`<!--${node.value}-->`);
      } else if ("children" in node) {
        html.push(
          renderNode({
            type: node.type,
            attributes: node.attributes,
            children: await resolve(node.children),
          }),
        );
      }
    }

    for (const [i] of html.entries()) {
      if (!!html[i] && !!html[i + 1]) {
        if (hasNoHTMLTags(html[i]) && hasNoHTMLTags(html[i + 1])) {
          html.splice(i + 1, 0, "<!--vynn:separator-->");
        }
      }
    }

    return joinHTMLElements(html);
  }

  try {
    return (
      (await resolve(resolveNode(App) as unknown as SSR_NODE[])) +
      `<script>window.__vynnAsyncData = ${JSON.stringify(owner.context.get("$async-values"))};window.__vynnRenderMode="${owner.context.get("$render-mode")}";document.currentScript.remove();</script>`
    );
  } finally {
    if (owner) disposeOwner(owner);
  }
}
