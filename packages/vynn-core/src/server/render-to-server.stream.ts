import {
  APPLY_PATCH_SSR_KEY,
  FALLBACK_END_SSR_MARKER,
  FALLBACK_START_SSR_MARKER,
} from "../const";
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
  return `<template id="${id}">${html}</template><script>${APPLY_PATCH_SSR_KEY}(${id});document.currentScript.remove();</script>`;
}

declare global {
  let $AP: (id: number) => void;
}

function renderPatchRuntime() {
  return `<script>var e=[];${APPLY_PATCH_SSR_KEY}=function(r){e.push(function(){return function(e){var r=document.querySelector('template[id="'+e+'"]');if(!r)return!1;for(var t=document.createTreeWalker(document,NodeFilter.SHOW_COMMENT),n=null,o=null;t.nextNode();){var a=t.currentNode;a.data==="${FALLBACK_START_SSR_MARKER}:"+e&&(n=a),a.data==="${FALLBACK_END_SSR_MARKER}:"+e&&(o=a)}if(!n||!o||!o.parentNode)return!1;for(var u=o.parentNode,c=n.nextSibling;c&&c!==o;){var i=c.nextSibling;c.remove(),c=i}return u.insertBefore(r.content,o),r.remove(),n.remove(),o.remove(),!0}(r)});for(var t=!0;t;){t=!1;for(var n=e.length-1;n>=0;n--)e[n]()&&(e.splice(n,1),t=!0)}},document.currentScript.remove();</script>`;

  // NOTE: EQUIVALENT CODE
  //   return `<script>
  // var queue = [];

  // function applyPatch(id) {
  //   var template = document.querySelector(
  //     'template[id="' + id + '"]',
  //   );

  //   if (!template) return false;

  //   var walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);

  //   var start = null;
  //   var end = null;

  //   while (walker.nextNode()) {
  //     var node = walker.currentNode;

  //     if (node.data === "${FALLBACK_START_SSR_MARKER}:"+ id) start = node;
  //     if (node.data === "${FALLBACK_END_SSR_MARKER}:"+ id) end = node;
  //   }

  //   if (!start || !end || !end.parentNode) {
  //     return false;
  //   }

  //   var parent = end.parentNode;
  //   var current = start.nextSibling;

  //   while (current && current !== end) {
  //     var next = current.nextSibling;
  //     current.remove();
  //     current = next;
  //   }

  //   parent.insertBefore(template.content, end);
  //   template.remove();
  //   start.remove();
  //   end.remove();

  //   return true;
  // }

  // ${APPLY_PATCH_SSR_KEY} = function (id) {
  //   queue.push(function () {
  //     return applyPatch(id);
  //   });

  //   var changed = true;

  //   while (changed) {
  //     changed = false;

  //     for (var i = queue.length - 1; i >= 0; i--) {
  //       if (queue[i]()) {
  //         queue.splice(i, 1);
  //         changed = true;
  //       }
  //     }
  //   }
  // };
  // document.currentScript.remove();
  // </script>`.replace(/\s+/g, " ");
}
