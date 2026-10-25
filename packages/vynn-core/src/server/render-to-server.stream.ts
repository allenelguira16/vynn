import { FALLBACK_END_SSR_MARKER, FALLBACK_START_SSR_MARKER } from "../const";
import { disposeOwner, getOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import {
  joinHTMLElements,
  renderAsyncUtilities,
  renderNode,
  renderText,
} from "./render-to-server.util";
import { resolveNode, SSR_NODE } from "../render/resolve-node";

export function resolveStream(
  App: () => JSX.Element,
): ReadableStream<Uint8Array> {
  const owner = getOwner()!;
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

  async function finishTask() {
    pending--;

    if (pending === 0 && initialSent && !closed) {
      enqueue(runWithOwner(owner, renderAsyncUtilities));

      closed = true;

      controller.close();
      disposeOwner(owner);
    }
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    let html: string[] = [];

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("promises" in node && node.type === "#async") {
        const id = nextBoundaryId++;

        // Render the fallback immediately instead of blocking on promises.
        html.push(
          `<!--${FALLBACK_START_SSR_MARKER}:${id}-->${await resolve(node.fallback())}<!--${FALLBACK_END_SSR_MARKER}:${id}-->`,
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
            await finishTask();
          }
        })();
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
          await finishTask();
        }
      })();
    },

    cancel() {
      closed = true;
    },
  });
}

function renderPatch(id: number, html: string) {
  return `<template data-vynn-patch="${id}">${html}</template><script>window.__vynnApplyPatch?.(${id});document.currentScript.remove();</script>`;
}

function renderPatchRuntime() {
  return `<script>(${(() => {
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

        if (node.data === `FALLBACK_START_SSR_MARKER:${id}`) start = node;
        if (node.data === `FALLBACK_END_SSR_MARKER:${id}`) end = node;
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
  })
    .toString()
    .replace(/\s+/g, " ")
    .replace("FALLBACK_START_SSR_MARKER", FALLBACK_START_SSR_MARKER)
    .replace(
      "FALLBACK_END_SSR_MARKER",
      FALLBACK_END_SSR_MARKER,
    )})();document.currentScript.remove();</script>`;
}
