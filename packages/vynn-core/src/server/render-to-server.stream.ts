import type { JSX } from "../types/jsx";

import {
  APPLY_HEAD_PATCH_SSR_KEY,
  APPLY_PATCH_SSR_KEY,
  FALLBACK_END_SSR_MARKER,
  FALLBACK_START_SSR_MARKER,
  ERROR_BOUNDARY_START_SSR_MARKER,
  ERROR_BOUNDARY_END_SSR_MARKER,
  APPLY_ERROR_BOUNDARY_PATCH_SSR_KEY,
} from "../const";
import { getOwner } from "../life-cycle/owner";
import {
  SSR_ASYNC,
  SSR_COMMENT,
  SSR_DEFERRED,
  SSR_ELEMENT,
  SSR_ERROR_BOUNDARY,
  type SSR_NODE,
  SSR_TEXT,
  SSRBoundaryFailure,
  SSRDeferredError,
  resolveNode,
} from "../render/resolve-node";
import { renderHeadPatch, type SsrHeadManager } from "./head";
import {
  createSSRUtilitiesRenderer,
  joinHTMLElements,
  renderErrorBoundaryRange,
  renderNode,
  renderText,
} from "./render-to-server.util";

export function resolveStream(
  App: () => JSX.Element,
  head: SsrHeadManager,
  disposeRenderOwner: () => void,
): ReadableStream<Uint8Array> {
  if (!getOwner()) {
    throw new Error("[vynn]: Streaming SSR requires an active render owner.");
  }

  const encoder = new TextEncoder();

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let pendingTasks = 0;
  let nextBoundaryId = 0;
  let initialChunkSent = false;
  let streamClosed = false;
  let renderOwnerReleased = false;
  let previousHead = "";
  let renderUtilities: () => string = () => "";

  const queuedPatches: string[] = [];

  function releaseRenderOwner(): void {
    if (renderOwnerReleased) return;

    renderOwnerReleased = true;
    disposeRenderOwner();
  }

  function enqueueChunk(html: string): void {
    if (streamClosed) return;

    controller.enqueue(encoder.encode(html));
  }

  function enqueuePatch(html: string): void {
    if (streamClosed) return;

    if (initialChunkSent) {
      enqueueChunk(html);
      return;
    }

    queuedPatches.push(html);
  }

  function flushQueuedPatches(): void {
    initialChunkSent = true;

    for (const patch of queuedPatches.splice(0)) {
      enqueueChunk(patch);
    }
  }

  function enqueueHeadPatch(): void {
    const nextHead = head.render();
    if (nextHead === previousHead) return;

    previousHead = nextHead;
    enqueuePatch(renderHeadPatch(nextHead));
  }

  function failStream(error: unknown): void {
    if (streamClosed) return;

    streamClosed = true;

    try {
      controller.error(error);
    } finally {
      releaseRenderOwner();
    }
  }

  async function finishTask(): Promise<void> {
    if (streamClosed) return;

    pendingTasks--;

    if (pendingTasks !== 0 || !initialChunkSent) return;

    try {
      enqueueChunk(renderUtilities());
      controller.close();
    } catch (error) {
      controller.error(error);
    } finally {
      streamClosed = true;
      releaseRenderOwner();
    }
  }

  async function renderAsyncNode(node: SSR_ASYNC): Promise<string> {
    const id = nextBoundaryId++;
    const fallbackNodes = node.withOwner(node.fallback);
    const fallbackHTML = await resolve(fallbackNodes);

    if (streamClosed) return "";

    enqueueHeadPatch();

    // Keep the fallback in the initial HTML while the real children resolve.
    pendingTasks++;
    void renderAsyncChildren(node, id);

    return (
      `<!--${FALLBACK_START_SSR_MARKER}:${id}-->` +
      fallbackHTML +
      `<!--${FALLBACK_END_SSR_MARKER}:${id}-->`
    );
  }

  async function patchErrorBoundary(
    boundary: SSR_ERROR_BOUNDARY | undefined,
    error: unknown,
  ): Promise<void> {
    const reason =
      error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure
        ? error.reason
        : error;

    if (!boundary || !(reason instanceof Error)) {
      failStream(reason);
      return;
    }

    // A shared error handler may already have claimed this error (for
    // example, when a render effect reports it). Only emit one fallback patch.
    if (!boundary.hasError) {
      if (!boundary.handle(reason)) return;
    } else if (boundary.error !== reason) {
      return;
    }

    if (!boundary.claimFallbackPatch()) return;

    try {
      const fallbackHTML = await resolve(boundary.fallback(reason));
      enqueuePatch(renderErrorBoundaryPatch(boundary.id, fallbackHTML));
      enqueueHeadPatch();
    } catch (fallbackError) {
      await patchErrorBoundary(boundary.parentBoundary, fallbackError);
    }
  }

  async function renderAsyncChildren(node: SSR_ASYNC, boundaryId: number): Promise<void> {
    try {
      await Promise.all(node.promises);

      if (node.errorBoundary?.hasError) return;

      const children = node.withOwner(node.children);
      const html = await resolve(children);

      // The shared handler may have claimed an error without throwing.
      if (node.errorBoundary?.error) {
        await patchErrorBoundary(node.errorBoundary, node.errorBoundary.error);
        return;
      }

      enqueuePatch(renderPatch(boundaryId, html));
    } catch (error) {
      await patchErrorBoundary(node.errorBoundary, error);
    } finally {
      await finishTask();
    }
  }

  async function renderDeferredNode(node: SSR_DEFERRED): Promise<string> {
    await Promise.all(node.promises);
    const children = node.withOwner(node.children);
    return await resolve(children);
  }

  async function renderErrorBoundary(node: SSR_ERROR_BOUNDARY): Promise<string> {
    let childrenHTML: string;

    try {
      childrenHTML = await resolve(node.children());
    } catch (error) {
      const reason =
        error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure
          ? error.reason
          : error;

      if (!(reason instanceof Error)) throw reason;

      if (!node.hasError && !node.handle(reason)) throw reason;
      if (node.error !== reason) throw reason;
    }

    if (node.error) {
      const fallbackHTML = await resolve(node.fallback(node.error));
      return renderErrorBoundaryRange(node.id, fallbackHTML);
    }

    return renderErrorBoundaryRange(node.id, childrenHTML!);
  }

  async function renderElement(node: SSR_ELEMENT): Promise<string> {
    const children = await resolve(node.children);

    return renderNode({
      type: node.type,
      attributes: node.attributes,
      innerHTML: node.innerHTML,
      children,
    });
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if (streamClosed) break;

      if (node instanceof SSR_ASYNC) {
        html.push(await renderAsyncNode(node));
        continue;
      }

      if (node instanceof SSR_DEFERRED) {
        html.push(await renderDeferredNode(node));
        continue;
      }

      if (node instanceof SSR_ERROR_BOUNDARY) {
        html.push(await renderErrorBoundary(node));
        continue;
      }

      if (node instanceof SSR_TEXT) {
        html.push(renderText(node));
        continue;
      }

      if (node instanceof SSR_COMMENT) {
        html.push(`<!--${node.value}-->`);
        continue;
      }

      if (node instanceof SSR_ELEMENT) {
        html.push(await renderElement(node));
      }
    }

    return joinHTMLElements(html);
  }

  async function renderInitialHTML(app: SSR_NODE[]): Promise<void> {
    try {
      const html = await resolve(app);
      if (streamClosed) return;

      enqueueChunk(renderPatchRuntime() + html);
      flushQueuedPatches();
    } catch (error) {
      const reason =
        error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure
          ? error.reason
          : error;

      failStream(reason);
    } finally {
      await finishTask();
    }
  }

  // Resolve the initial app while this render's owner is synchronously active.
  // Every async continuation then uses the owner captured by its SSR node.
  let initialApp: SSR_NODE[] = [];
  let initialError: unknown;
  let hasInitialError = false;

  try {
    initialApp = resolveNode(App) as unknown as SSR_NODE[];
    previousHead = head.render();
    renderUtilities = createSSRUtilitiesRenderer();
  } catch (error) {
    hasInitialError = true;
    initialError =
      error instanceof SSRDeferredError || error instanceof SSRBoundaryFailure
        ? error.reason
        : error;
  }

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      pendingTasks++;

      if (hasInitialError) {
        failStream(initialError);
        return;
      }

      void renderInitialHTML(initialApp);
    },

    cancel() {
      streamClosed = true;
      releaseRenderOwner();
    },
  });
}

function renderPatch(id: number, html: string) {
  return `<template id="${id}">${html}</template><script>${APPLY_PATCH_SSR_KEY}(${id});document.currentScript.remove();</script>`;
}

function renderErrorBoundaryPatch(id: number, html: string) {
  return `<template id="vynn-eb-${id}">${html}</template><script>${APPLY_ERROR_BOUNDARY_PATCH_SSR_KEY}(${id});document.currentScript.remove();</script>`;
}

function renderPatchRuntime(): string {
  return `<script>
var queuedPatches = [];

function queuePatch(patch) {
  queuedPatches.push(patch);
  flushQueuedPatches();
}

function flushQueuedPatches() {
  var progressed = true;

  while (progressed) {
    progressed = false;

    for (var index = queuedPatches.length - 1; index >= 0; index--) {
      if (queuedPatches[index]()) {
        queuedPatches.splice(index, 1);
        progressed = true;
      }
    }
  }
}

function findCommentRange(startMarker, endMarker) {
  var walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  var start = null;
  var end = null;

  while (walker.nextNode()) {
    var comment = walker.currentNode;

    if (comment.data === startMarker) start = comment;
    if (comment.data === endMarker) end = comment;
  }

  return { start: start, end: end };
}

function removeRangeContents(start, end) {
  var current = start.nextSibling;

  while (current && current !== end) {
    var next = current.nextSibling;
    current.remove();
    current = next;
  }
}

window.${APPLY_PATCH_SSR_KEY} = function (id) {
  queuePatch(function () {
    var template = document.querySelector('template[id="' + id + '"]');
    if (!template) return false;

    var range = findCommentRange(
      "${FALLBACK_START_SSR_MARKER}:" + id,
      "${FALLBACK_END_SSR_MARKER}:" + id
    );

    if (!range.start || !range.end || !range.end.parentNode) return false;

    var parent = range.end.parentNode;
    removeRangeContents(range.start, range.end);
    parent.insertBefore(template.content, range.end);

    template.remove();
    range.start.remove();
    range.end.remove();

    return true;
  });
};

window.${APPLY_ERROR_BOUNDARY_PATCH_SSR_KEY} = function (id) {
  queuePatch(function () {
    var template = document.querySelector('template[id="vynn-eb-' + id + '"]');
    if (!template) return false;

    var range = findCommentRange(
      "${ERROR_BOUNDARY_START_SSR_MARKER}:" + id,
      "${ERROR_BOUNDARY_END_SSR_MARKER}:" + id
    );

    if (!range.start || !range.end || !range.end.parentNode) return false;

    var parent = range.end.parentNode;
    removeRangeContents(range.start, range.end);
    parent.insertBefore(template.content, range.end);
    template.remove();

    return true;
  });
};

window.${APPLY_HEAD_PATCH_SSR_KEY} =
  window.${APPLY_HEAD_PATCH_SSR_KEY} || function (html) {
    var template = document.createElement("template");
    template.innerHTML = html;

    function getHeadNodeKey(node) {
      var tag = node.tagName.toLowerCase();

      if (tag === "title") return "title";

      if (tag === "meta") {
        if (node.hasAttribute("charset")) return "meta:charset";

        var name = node.getAttribute("name");
        if (name) return "meta:name:" + name.toLowerCase();

        var property = node.getAttribute("property");
        if (property) return "meta:property:" + property.toLowerCase();

        var httpEquiv = node.getAttribute("http-equiv");
        if (httpEquiv) return "meta:http-equiv:" + httpEquiv.toLowerCase();
      }

      if (tag === "link") {
        var rel = (node.getAttribute("rel") || "").toLowerCase();
        var href = node.getAttribute("href") || "";

        return rel === "canonical" ? "link:canonical" : "link:" + rel + ":" + href;
      }

      return null;
    }

    template.content.querySelectorAll("[key]").forEach(function (node) {
      var key = node.getAttribute("key");
      var selector = node.tagName.toLowerCase();

      document.head.querySelectorAll(selector).forEach(function (existing) {
        if (existing.getAttribute("key") === key || getHeadNodeKey(existing) === key) {
          existing.remove();
        }
      });
    });

    document.head.querySelectorAll("[key]").forEach(function (node) {
      node.remove();
    });

    document.head.append(template.content);
  };

document.currentScript.remove();
</script>`;
}
