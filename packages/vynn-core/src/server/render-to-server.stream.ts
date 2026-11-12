import type { ErrorBoundary } from "../context/error-boundary-context";
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
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";
import {
  type SSR_ASYNC,
  type SSR_DEFERRED,
  type SSR_ELEMENT,
  type SSR_ERROR_BOUNDARY,
  type SSR_NODE,
  SSRBoundaryFailure,
  SSRBoundaryPatchHandledError,
  SSRDeferredError,
  isSSRErrorBoundary,
  isSSRElement,
  resolveNode,
  resolveSSRAsyncChildren,
  resolveSSRDeferredChildren,
} from "../render/resolve-node";
import { renderHeadPatch, type SsrHeadManager } from "./head";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderNode,
  renderText,
  renderErrorBoundaryRange,
} from "./render-to-server.util";

export function resolveStream(
  App: () => JSX.Element,
  head: SsrHeadManager,
  disposeRenderOwner: () => void,
): ReadableStream<Uint8Array> {
  const owner = getOwner();

  if (!owner) {
    throw new Error("[vynn]: Streaming SSR requires an active render owner.");
  }
  const encoder = new TextEncoder();

  let controller: ReadableStreamDefaultController<Uint8Array>;
  let pending = 0;
  let nextBoundaryId = 0;
  let initialSent = false;
  let closed = false;
  let ownerReleased = false;
  let previousHead = "";

  const queuedPatches: string[] = [];

  function releaseRenderOwner() {
    if (ownerReleased) return;
    ownerReleased = true;
    disposeRenderOwner();
  }

  function enqueueHeadPatch() {
    const nextHead = head.render();
    if (nextHead === previousHead) return;

    previousHead = nextHead;
    enqueuePatch(renderHeadPatch(nextHead));
  }

  function enqueue(html: string) {
    if (!closed) {
      controller.enqueue(encoder.encode(html));
    }
  }

  function enqueuePatch(html: string) {
    if (closed) return;

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

  function failStream(error: unknown): void {
    if (closed) return;

    closed = true;
    try {
      controller.error(error);
    } finally {
      releaseRenderOwner();
    }
  }

  async function recoverBackgroundError(
    error: unknown,
    fallbackBoundary?: ErrorBoundary,
  ): Promise<void> {
    if (closed || error instanceof SSRBoundaryPatchHandledError) return;

    if (error instanceof SSRDeferredError) {
      failStream(error.reason);
      return;
    }

    let boundary: ErrorBoundary;

    try {
      if (error instanceof SSRBoundaryFailure) {
        boundary = error.handled ? error.boundary : error.boundary.handle(error.reason);
      } else if (error instanceof Error && !(error instanceof NotReadyError) && fallbackBoundary) {
        boundary = fallbackBoundary.handle(error);
      } else {
        failStream(error);
        return;
      }
    } catch (boundaryError) {
      failStream(boundaryError);
      return;
    }

    try {
      const html = await resolve(boundary.render(), true);
      if (closed || !boundary.isActive()) return;

      enqueueHeadPatch();
      enqueuePatch(renderErrorBoundaryPatch(boundary.id, html));
    } catch (renderError) {
      if (renderError instanceof SSRBoundaryPatchHandledError) return;
      await recoverBackgroundError(renderError, boundary);
    }
  }

  async function finishTask() {
    if (closed) return;

    pending--;

    if (pending === 0 && initialSent) {
      try {
        enqueue(runWithOwner(owner, renderAsyncUtilities));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        closed = true;
        releaseRenderOwner();
      }
    }
  }

  function throwDeferredNodeError(error: unknown, boundary?: ErrorBoundary): never {
    if (
      error instanceof SSRDeferredError ||
      error instanceof SSRBoundaryFailure ||
      error instanceof SSRBoundaryPatchHandledError ||
      error instanceof NotReadyError
    ) {
      throw error;
    }

    if (error instanceof Error && boundary) {
      throw new SSRBoundaryFailure(error, boundary);
    }

    throw error;
  }

  async function renderAsyncNode(
    node: SSR_ASYNC,
    background: boolean,
    availableErrorBoundaryIds: ReadonlySet<number>,
  ): Promise<string> {
    const id = nextBoundaryId++;

    // Render the fallback immediately instead of blocking on promises.
    const fallbackHTML = await resolve(
      runWithOwner(owner, node.fallback),
      background,
      availableErrorBoundaryIds,
    );
    if (closed) return "";

    enqueueHeadPatch();

    // Resolve the real children in the background and replace this fallback.
    pending++;
    void (async () => {
      try {
        const childNodes = await resolveSSRAsyncChildren(node);
        if (closed) return;

        enqueueHeadPatch();

        const children = await resolve(childNodes, true, new Set(availableErrorBoundaryIds));
        if (closed) return;

        enqueueHeadPatch();
        enqueuePatch(renderPatch(id, children));
      } catch (error) {
        await recoverBackgroundError(error, node.errorBoundary);
      } finally {
        await finishTask();
      }
    })();

    return (
      "<!--" +
      FALLBACK_START_SSR_MARKER +
      ":" +
      id +
      "-->" +
      fallbackHTML +
      "<!--" +
      FALLBACK_END_SSR_MARKER +
      ":" +
      id +
      "-->"
    );
  }

  async function renderDeferredNode(
    node: SSR_DEFERRED,
    background: boolean,
    availableErrorBoundaryIds: ReadonlySet<number>,
  ): Promise<string> {
    try {
      const childNodes = await resolveSSRDeferredChildren(node);

      enqueueHeadPatch();
      const children = await resolve(childNodes, background, availableErrorBoundaryIds);
      enqueueHeadPatch();

      return children;
    } catch (error) {
      throwDeferredNodeError(error, node.errorBoundary);
    }
  }

  async function renderErrorBoundary(
    node: SSR_ERROR_BOUNDARY,
    background: boolean,
    availableErrorBoundaryIds: ReadonlySet<number>,
  ): Promise<string> {
    let children: string;
    const boundaryChildIds = new Set(availableErrorBoundaryIds);
    boundaryChildIds.add(node.id);

    try {
      children = await resolve(runWithOwner(owner, node.children), background, boundaryChildIds);
    } catch (error) {
      let boundary: ErrorBoundary;

      if (error instanceof SSRBoundaryFailure) {
        boundary = error.handled ? error.boundary : error.boundary.handle(error.reason);

        if (boundary.id !== node.id) {
          throw new SSRBoundaryFailure(error.reason, boundary, true);
        }
      } else if (error instanceof Error) {
        boundary = node.errorBoundary.handle(error);

        if (boundary.id !== node.id) {
          throw new SSRBoundaryFailure(error, boundary, true);
        }
      } else {
        throw error;
      }

      children = await resolve(boundary.render(), background, availableErrorBoundaryIds);
      enqueueHeadPatch();

      if (background && availableErrorBoundaryIds.has(boundary.id)) {
        if (boundary.isActive()) {
          enqueuePatch(renderErrorBoundaryPatch(boundary.id, children));
        }

        throw new SSRBoundaryPatchHandledError();
      }
    }

    return renderErrorBoundaryRange(node.id, children);
  }

  async function renderElement(
    node: SSR_ELEMENT,
    background: boolean,
    availableErrorBoundaryIds: ReadonlySet<number>,
  ): Promise<string> {
    return renderNode({
      type: node.type,
      attributes: node.attributes,
      innerHTML: node.innerHTML,
      children: await resolve(node.children, background, availableErrorBoundaryIds),
    });
  }

  async function resolve(
    app: SSR_NODE[],
    background = false,
    availableErrorBoundaryIds: ReadonlySet<number> = new Set(),
  ): Promise<string> {
    const html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if (closed) break;

      if ("promises" in node && node.type === "#async") {
        html.push(await renderAsyncNode(node, background, availableErrorBoundaryIds));
      } else if ("promises" in node && node.type === "#deferred") {
        html.push(await renderDeferredNode(node, background, availableErrorBoundaryIds));
      } else if (isSSRErrorBoundary(node)) {
        html.push(await renderErrorBoundary(node, background, availableErrorBoundaryIds));
      } else if ("value" in node && node.type === "#text") {
        html.push(renderText(node));
      } else if ("value" in node && node.type === "#comment") {
        html.push("<!--" + node.value + "-->");
      } else if (isSSRElement(node)) {
        html.push(await renderElement(node, background, availableErrorBoundaryIds));
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
          const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
          previousHead = head.render();

          const initialHTML = await resolve(app);
          if (closed) return;

          enqueue(renderPatchRuntime() + initialHTML);
          flushPatches();
        } catch (error) {
          failStream(
            error instanceof SSRDeferredError
              ? error.reason
              : error instanceof SSRBoundaryFailure
                ? error.reason
                : error,
          );
          return;
        } finally {
          await finishTask();
        }
      })();
    },

    cancel() {
      closed = true;
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
