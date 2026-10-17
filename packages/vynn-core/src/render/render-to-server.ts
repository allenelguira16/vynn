import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { resolveNode, SSR_ELEMENT, SSR_NODE } from "./resolve-node";
import { setRenderMode } from "../context/render-mode";
import { escapeHtml } from "../utils/escape-html";

export function renderToServer(
  App: () => JSX.Element,
  mode: "sync" | "async" | "stream",
) {
  const owner = createOwner();

  return runWithOwner(owner, () => {
    setRenderMode(mode);

    switch (mode) {
      case "sync": {
        try {
          return resolveSync(App);
        } finally {
          disposeOwner(owner);
        }
      }
      case "async": {
        return resolveAsync(App).finally(() => {
          disposeOwner(owner);
        });
      }
      case "stream": {
        console.warn(
          "[vynn]: Stream is not yet supported and might come in the next version, please stay informed!",
        );
      }
    }
  });
}

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

function renderNode(props: {
  type: string;
  attributes: SSR_ELEMENT["attributes"];
  children: string;
}) {
  let attributes = Object.entries(props.attributes)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
  attributes = attributes ? ` ${attributes}` : "";

  if (voidElements.has(props.type)) {
    if (props.children.length > 0) {
      console.warn(
        `[vynn]: <${props.type}> is a void element and cannot have children therefore it will ignore the children`,
      );
    }

    return `<${props.type}${attributes}>`;
  } else {
    return `<${props.type}${attributes}>${props.children}</${props.type}>`;
  }
}

function resolveSync(App: () => JSX.Element) {
  function resolve(app: SSR_NODE[]): string {
    let html = "";
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("fallback" in node) {
        // DO NOTHING
      } else if ("value" in node && node.type === "#text") {
        html += escapeHtml(node.value);
      } else if ("children" in node) {
        html += renderNode({
          type: node.type,
          attributes: node.attributes,
          children: resolve(node.children),
        });
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
      if ("fallback" in node) {
        await Promise.all(node.promises);

        html += await resolve(node.children());
      } else if ("value" in node && node.type === "#text") {
        html += escapeHtml(node.value);
      } else if ("children" in node) {
        html += renderNode({
          type: node.type,
          attributes: node.attributes,
          children: await resolve(node.children),
        });
      }
    }

    return html;
  }

  return resolve(resolveNode(App) as unknown as SSR_NODE[]);
}
