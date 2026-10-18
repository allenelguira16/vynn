import {
  createOwner,
  disposeOwner,
  getCurrentOwner,
  runWithOwner,
} from "../life-cycle/owner";
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
        return resolveSync(App);
      }
      case "async": {
        return resolveAsync(App);
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

  try {
    return resolve(resolveNode(App) as unknown as SSR_NODE[]);
  } finally {
    const owner = getCurrentOwner();
    if (owner) disposeOwner(owner);
  }
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
        const children = await resolve(node.children);
        html += renderNode({
          type: node.type,
          attributes: node.attributes,
          children,
        });
      }
    }

    return html;
  }

  try {
    return resolve(resolveNode(App) as unknown as SSR_NODE[]);
  } finally {
    const owner = getCurrentOwner();
    if (owner) disposeOwner(owner);
  }
}

function resolveStream(App: () => JSX.Element): ReadableStream<Uint8Array> {
  const owner = getCurrentOwner();
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
      if (owner) disposeOwner(owner);
    }
  }

  function renderPatch(id: number, html: string) {
    return `<template data-vynn-patch="${id}">${html}</template>
<script>
(function() {
  var id = "${id}";
  var queue = window.__vynnPendingPatches ||
    (window.__vynnPendingPatches = []);

  function applyPatch() {
    var template = document.querySelector(
      'template[data-vynn-patch="' + id + '"]'
    );

    if (!template) return false;

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

    // An ancestor patch may not have inserted these markers yet.
    if (!start || !end || !end.parentNode) {
      return false;
    }

    var parent = end.parentNode;
    var current = start.nextSibling;

    while (current && current !== end) {
      var next = current.nextSibling;
      current.remove();
      current = next;
    }

    parent.insertBefore(template.content, end);
    template.remove();

    return true;
  }

  queue.push(applyPatch);

  // Apply patches whose markers are available. Applying a parent patch
  // may insert markers needed by a previously queued child patch.
  var changed = true;

  while (changed) {
    changed = false;

    for (var i = queue.length - 1; i >= 0; i--) {
      if (queue[i]()) {
        queue.splice(i, 1);
        changed = true;
      }
    }
  }
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

        html += `<!--vynn:${id}:end-->`;

        // Keep rendering the boundary in the background.
        pending++;

        void (async () => {
          try {
            await Promise.all(node.promises);

            const children = await resolve(node.children());

            enqueuePatch(renderPatch(id, children));
          } catch (error) {
            console.error("[vynn]: Failed to resolve an SSR boundary", error);
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
