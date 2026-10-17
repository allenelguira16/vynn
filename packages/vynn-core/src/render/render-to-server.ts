import { characterCodeToRegularExpressionFlag } from "typescript/unstable/ast";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { escapeHtml } from "../utils/escape-html";
import { setRenderMode } from "../utils/render-mode";
import { resolveNode, SSR_NODE } from "./resolve-node";
import { NotReadyError } from "../components/boundary";

export function renderToServer(
  App: () => JSX.Element,
  mode: "sync" | "async" | "stream",
) {
  setRenderMode(mode);

  const owner = createOwner();
  return runWithOwner(owner, () => {
    if (mode === "sync") {
      try {
        return resolveSync(App);
      } finally {
        disposeOwner(owner);
      }
    }

    if (mode === "async") {
      return resolveAsync(App).finally(() => {
        disposeOwner(owner);
      });
    }

    // if (mode === "stream") {
    //   return resolveStream(App);
    // }
  });
}

function resolveSync(App: () => JSX.Element) {
  function resolve(app: SSR_NODE[]): string {
    let html = "";
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if (node instanceof Function) {
        html += resolve(
          resolveNode(
            node as unknown as () => JSX.Element,
          ) as unknown as SSR_NODE[],
        );
      } else if ("value" in node && node.type === "#text") {
        html += node.value;
      } else if ("fallback" in node) {
        // DO NOTHING
        // await Promise.all(node.promises);
        // html += await resolve(node.children());
      } else if ("children" in node) {
        let attributes = Object.entries(node.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        attributes = attributes ? ` ${attributes}` : "";
        html += `<${node.type}${attributes}>${resolve(node.children)}</${node.type}>`;
      }
    }

    return html;
  }

  return resolve(App() as unknown as SSR_NODE[]);
}

async function resolveAsync(App: () => JSX.Element): Promise<string> {
  async function resolve(app: SSR_NODE[]): Promise<string> {
    let html = "";
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if (node instanceof Function) {
        html += await resolve(
          resolveNode(
            node as unknown as () => JSX.Element,
          ) as unknown as SSR_NODE[],
        );
      } else if ("value" in node && node.type === "#text") {
        html += node.value;
      } else if ("fallback" in node) {
        await Promise.all(node.promises);
        html += await resolve(node.children());
      } else if ("children" in node) {
        let attributes = Object.entries(node.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        attributes = attributes ? ` ${attributes}` : "";
        html += `<${node.type}${attributes}>${await resolve(node.children)}</${node.type}>`;
      } else if (node instanceof Promise) {
        html += await resolve(await node);
      }
    }

    return html;
  }

  return resolve(resolveNode(App) as unknown as SSR_NODE[]);
}
