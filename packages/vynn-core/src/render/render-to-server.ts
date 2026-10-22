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
  owner.context.set("$async-values", []);
  owner.context.set("$lazy-id", 0);

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

// const TEXT_BOUNDARY = "<!--vynn:t-->";
// const EMPTY_TEXT_MARKER = "<!--vynn:text-->";

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

function joinHTMLElements(html: string[]): string {
  const result: string[] = [];

  for (let i = 0; i < html.length; i++) {
    const current = html[i];
    const next = html[i + 1];

    result.push(current);

    if (current && next && hasNoHTMLTags(current) && hasNoHTMLTags(next)) {
      result.push("<!--vynn:separator-->");
    }
  }

  return result.join("");
}

function hasNoHTMLTags(str: string) {
  // Matches anything inside <...>
  const htmlTagRegex = /<[^>]+>/g;
  return !htmlTagRegex.test(str);
}

function resolveSync(App: () => JSX.Element) {
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
    return resolve(resolveNode(App) as unknown as SSR_NODE[]);
  } finally {
    const owner = getCurrentOwner();
    if (owner) disposeOwner(owner);
  }
}

async function resolveAsync(App: () => JSX.Element): Promise<string> {
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
      } else if ("children" in node) {
        // const children = ;

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
    return resolve(resolveNode(App) as unknown as SSR_NODE[]);
  } finally {
    const owner = getCurrentOwner();
    if (owner) disposeOwner(owner);
  }
}

function resolveStream(App: () => JSX.Element): ReadableStream<Uint8Array> {
  const owner = getCurrentOwner()!;
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
      enqueue(
        `<script>window.__vynnAsyncData = ${JSON.stringify(owner.context.get("$async-values"))};document.currentScript.remove();</script>`,
      );
      closed = true;
      // console.log();

      controller.close();
      disposeOwner(owner);
    }
  }

  function vynnPatchRuntime() {
    var queue = ((window as any).__vynnPendingPatches =
      (window as any).__vynnPendingPatches || []);

    function applyPatch(id: number) {
      var template = document.querySelector(
        'template[data-vynn-patch="' + id + '"]',
      ) as HTMLTemplateElement | null;

      if (!template) return false;

      var walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);

      var start: Comment | null = null;
      var end: Comment | null = null;

      while (walker.nextNode()) {
        var node = walker.currentNode as Comment;

        if (node.data === "vynn:" + id + ":start") start = node;
        if (node.data === "vynn:" + id + ":end") end = node;
      }

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
      start.remove();
      end.remove();

      return true;
    }

    (window as any).__vynnApplyPatch = function (id: number) {
      queue.push(function () {
        return applyPatch(id);
      });

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
    };
  }

  function renderPatchRuntime() {
    return `<script>(${vynnPatchRuntime.toString()})();document.currentScript.remove();</script>`;
  }

  function renderPatch(id: number, html: string) {
    return `<template data-vynn-patch="${id}">${html}</template><script>window.__vynnApplyPatch?.(${id});document.currentScript.remove();</script>`;
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    let html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node && node.type === "#async") {
        const id = nextBoundaryId++;

        // Render the fallback immediately instead of blocking on promises.
        html.push(
          `<!--vynn:${id}:start-->${await resolve(node.fallback())}<!--vynn:${id}:end-->`,
        );

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
      } else if ("promises" in node && node.type === "#deferred") {
        await Promise.all(node.promises);

        html.push(await resolve(node.children()));
      } else if ("value" in node && node.type === "#text") {
        html.push(
          node.value === "" ? "<!--vynn:text-->" : escapeHtml(node.value),
        );
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

          enqueue(renderPatchRuntime() + initialHTML);
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
