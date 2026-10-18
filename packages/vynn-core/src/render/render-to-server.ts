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
        return resolveStream(App);
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

function resolveStream(App: () => JSX.Element): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  let controller: ReadableStreamDefaultController<Uint8Array>;
  let pending = 0;
  let nextBoundaryId = 0;
  let initialSent = false;
  let closed = false;

  const queuedPatches: string[] = [];

  function enqueue(html: string) {
    if (!closed) {
      controller.enqueue(encoder.encode(html));
    }
  }

  function enqueuePatch(html: string) {
    if (!initialSent) {
      queuedPatches.push(html);
    } else {
      enqueue(html);
    }
  }

  function flushPatches() {
    initialSent = true;

    for (const patch of queuedPatches.splice(0)) {
      enqueue(patch);
    }
  }

  function finishTask() {
    pending--;

    if (pending === 0 && initialSent && !closed) {
      closed = true;
      controller.close();
    }
  }

  function renderPatch(id: number, html: string) {
    return `<template data-vynn-patch="${id}">${html}</template>
<script>
(function() {
  var id = "${id}";
  var walker = document.createTreeWalker(
    document,
    NodeFilter.SHOW_COMMENT
  );
  var start = null;
  var end = null;

  while (walker.nextNode()) {
    var node = walker.currentNode;

    if (node.data === "vynn:" + id + ":start") start = node;
    if (node.data === "vynn:" + id + ":end") end = node;
  }

  var template = document.querySelector(
    'template[data-vynn-patch="' + id + '"]'
  );

  if (!start || !end || !template) return;

  var current = start.nextSibling;

  while (current && current !== end) {
    var next = current.nextSibling;
    current.remove();
    current = next;
  }

  end.parentNode.insertBefore(template.content, end);
  template.remove();
})();
</script>`;
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    let html = "";

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("fallback" in node) {
        const id = nextBoundaryId++;

        html += `<!--vynn:${id}:start-->`;

        // Render the fallback immediately instead of blocking on promises.
        html += await resolve(node.fallback());
        console.log(html);

        html += `<!--vynn:${id}:end-->`;

        // Keep rendering the boundary in the background.
        pending++;

        void (async () => {
          try {
            await Promise.all(node.promises);

            const children = await resolve(node.children());

            enqueuePatch(renderPatch(id, children));
          } finally {
            finishTask();
          }
        })();
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

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;

      // Keep the stream alive while the initial render is in progress.
      pending++;

      void (async () => {
        try {
          const initialHTML = await resolve(
            resolveNode(App) as unknown as SSR_NODE[],
          );

          enqueue(initialHTML);
          flushPatches();
        } catch (error) {
          if (!closed) {
            closed = true;
            controller.error(error);
          }

          return;
        } finally {
          finishTask();
        }
      })();
    },

    cancel() {
      closed = true;
    },
  });
}
