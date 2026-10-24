import { disposeOwner, getOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderNode,
  renderText,
} from "./render-to-server.util";
import { resolveNode, SSR_NODE } from "../render/resolve-node";

export async function resolveAsync(App: () => JSX.Element): Promise<string> {
  const owner = getOwner()!;

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
        html.push(renderText(node));
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

    return joinHTMLElements(html);
  }

  try {
    return (
      (await resolve(resolveNode(App) as unknown as SSR_NODE[])) +
      renderAsyncUtilities(owner)
    );
  } finally {
    if (owner) disposeOwner(owner);
  }
}
