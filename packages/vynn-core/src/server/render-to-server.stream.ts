import {
  APPLY_HEAD_PATCH_SSR_KEY,
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
import type { HeadContext } from "../context/head-context";
import { renderHeadPatch, renderSsrHead } from "./head";

export function resolveStream(
  App: () => JSX.Element,
  headContext: HeadContext,
): ReadableStream<Uint8Array> {
  const owner = getOwner()!;
  const encoder = new TextEncoder();

  let controller: ReadableStreamDefaultController<Uint8Array>;
  let pending = 0;
  let nextBoundaryId = 0;
  let initialSent = false;
  let closed = false;
  let previousHead = "";

  const queuedPatches: string[] = [];

  function enqueueHeadPatch() {
    const nextHead = renderSsrHead(headContext);
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
        const fallbackHTML = await resolve(node.fallback());
        enqueueHeadPatch();
        html.push(
          `<!--${FALLBACK_START_SSR_MARKER}:${id}-->${fallbackHTML}<!--${FALLBACK_END_SSR_MARKER}:${id}-->`,
        );

        // Keep rendering the boundary in the background.
        pending++;

        void (async () => {
          try {
            await Promise.all(node.promises);

            const childNodes = node.children();
            enqueueHeadPatch();

            const children = await resolve(childNodes);
            enqueueHeadPatch();

            enqueuePatch(renderPatch(id, children));
          } catch (error) {
            console.error("[vynn]: Failed to resolve an SSR boundary", error);
          } finally {
            await finishTask();
          }
        })();
      } else if ("promises" in node && node.type === "#deferred") {
        await Promise.all(node.promises);

        const childNodes = node.children();
        enqueueHeadPatch();
        html.push(await resolve(childNodes));
        enqueueHeadPatch();
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
          const app = resolveNode(App) as unknown as SSR_NODE[];
          previousHead = renderSsrHead(headContext);

          const initialHTML = await resolve(app);

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
  return `<script>var e=[];window.${APPLY_PATCH_SSR_KEY}=function(r){e.push(function(){return function(e){var r=document.querySelector('template[id="'+e+'"]');if(!r)return!1;for(var t=document.createTreeWalker(document,NodeFilter.SHOW_COMMENT),n=null,o=null;t.nextNode();){var a=t.currentNode;a.data==="${FALLBACK_START_SSR_MARKER}:"+e&&(n=a),a.data==="${FALLBACK_END_SSR_MARKER}:"+e&&(o=a)}if(!n||!o||!o.parentNode)return!1;for(var u=o.parentNode,c=n.nextSibling;c&&c!==o;){var i=c.nextSibling;c.remove(),c=i}return u.insertBefore(r.content,o),r.remove(),n.remove(),o.remove(),!0}(r)});for(var t=!0;t;){t=!1;for(var n=e.length-1;n>=0;n--)e[n]()&&(e.splice(n,1),t=!0)}};window.${APPLY_HEAD_PATCH_SSR_KEY}=window.${APPLY_HEAD_PATCH_SSR_KEY}||function(h){var t=document.createElement("template");t.innerHTML=h;function i(n){var g=n.tagName.toLowerCase();if(g==="title")return"title";if(g==="meta"){if(n.hasAttribute("charset"))return"meta:charset";var a=n.getAttribute("name");if(a)return"meta:name:"+a.toLowerCase();var p=n.getAttribute("property");if(p)return"meta:property:"+p.toLowerCase();var q=n.getAttribute("http-equiv");if(q)return"meta:http-equiv:"+q.toLowerCase()}if(g==="link"){var r=(n.getAttribute("rel")||"").toLowerCase(),u=n.getAttribute("href")||"";return r==="canonical"?"link:canonical":"link:"+r+":"+u}return null}t.content.querySelectorAll("[head-id]").forEach(function(n){var a=n.getAttribute("head-id");document.head.querySelectorAll(n.tagName.toLowerCase()).forEach(function(o){if(o.getAttribute("head-id")===a||i(o)===a)o.remove()})});document.head.querySelectorAll("[head-id]").forEach(function(n){n.remove()});document.head.append(t.content)};document.currentScript.remove();</script>`;
}
