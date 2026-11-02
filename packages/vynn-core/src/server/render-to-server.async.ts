import { runWithOwner, type Owner } from "../life-cycle/owner";
import { SSR_NODE, resolveNode } from "../render/resolve-node";
import { JSX } from "../types/jsx";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderNode,
  renderText,
} from "./render-to-server.util";

export async function resolveAsync(App: () => JSX.Element, owner: Owner): Promise<string> {
  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node && node.type === "#async") {
        await Promise.all(node.promises);

        html.push(await resolve(runWithOwner(owner, node.children)));
      } else if ("promises" in node && node.type === "#deferred") {
        await Promise.all(node.promises);

        html.push(await resolve(runWithOwner(owner, node.children)));
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

  const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
  const resolved = await resolve(app);
  const utilities = runWithOwner(owner, renderAsyncUtilities);

  return resolved + utilities;
}
