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
import {
  SSR_ASYNC,
  SSR_COMMENT,
  SSR_DEFERRED,
  SSR_ELEMENT,
  SSR_ERROR_BOUNDARY,
  type SSR_NODE,
  SSR_TEXT,
  resolveNode,
} from "../render/resolve-node";
import { renderHeadPatch, type SsrHeadManager } from "./head";
import {
  flattenSSRNodes,
  joinHTMLElements,
  renderAsyncUtilities,
  renderComment,
  renderElement,
  renderErrorBoundaryAsync,
  renderText,
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

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let pendingTasks = 0;
  let nextBoundaryId = 0;
  let initialChunkSent = false;
  let streamClosed = false;
  let renderOwnerReleased = false;
  let previousHead = "";

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
      enqueueChunk(runWithOwner(owner, renderAsyncUtilities));
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
    const fallbackNodes = runWithOwner(owner, node.fallback);
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

  async function renderAsyncChildren(node: SSR_ASYNC, boundaryId: number): Promise<void> {
    try {
      // Rejections become render errors only when the retry still reads the
      // failed resource. The resource stores its rejection before this retry.
      await Promise.allSettled(node.promises);

      // A different async boundary may have already failed the stream and
      // disposed the render owner while this boundary was waiting.
      if (streamClosed) return;

      enqueuePatch(renderPatch(boundaryId, await resolve(node.children())));
    } catch (error) {
      try {
        const boundary = error instanceof Error ? node.errorBoundary?.(error) : undefined;

        if (!(boundary instanceof SSR_ERROR_BOUNDARY)) {
          failStream(error);
          return;
        }

        const fallbackHTML = await resolve(boundary.fallback());
        enqueuePatch(renderErrorBoundaryPatch(boundary.id, fallbackHTML));
      } catch (boundaryError) {
        failStream(boundaryError);
      }
    } finally {
      await finishTask();
    }
  }

  async function renderDeferredNode(node: SSR_DEFERRED): Promise<string> {
    // Preserve control-flow failures such as redirects for blocking work.
    // Otherwise retry after settlement so stale rejected resources are ignored.
    if (node.blocking) {
      await Promise.all(node.promises);
    } else {
      await Promise.allSettled(node.promises);
    }

    // Another pending boundary can fail the stream while this deferred
    // node is waiting. Do not retry its children after the render owner has
    // been released.
    if (streamClosed) return "";

    return await resolve(node.children());
  }

  async function resolve(app: SSR_NODE[]): Promise<string> {
    const html: string[] = [];

    for (const node of flattenSSRNodes(app)) {
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
        html.push(await renderErrorBoundaryAsync(node, resolve));
        continue;
      }

      if (node instanceof SSR_TEXT) {
        html.push(renderText(node));
        continue;
      }

      if (node instanceof SSR_COMMENT) {
        html.push(renderComment(node));
        continue;
      }

      if (node instanceof SSR_ELEMENT) {
        html.push(renderElement(node, await resolve(node.children)));
      }
    }

    return joinHTMLElements(html);
  }

  async function renderInitialHTML(): Promise<void> {
    try {
      const app = runWithOwner(owner, () => resolveNode(App)) as unknown as SSR_NODE[];
      previousHead = head.render();

      const html = await resolve(app);
      if (streamClosed) return;

      enqueueChunk((nextBoundaryId > 0 ? renderPatchRuntime() : "") + html);
      flushQueuedPatches();
    } catch (error) {
      failStream(error);
    } finally {
      await finishTask();
    }
  }

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;

      // Hold the stream open until the initial HTML has been rendered.
      pendingTasks++;
      void renderInitialHTML();
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
  return `<script>var q=[];function f(){for(var p=1;p;){p=0;for(var i=q.length-1;i>=0;i--)if(q[i]()){q.splice(i,1);p=1}}}function u(p){q.push(p);f()}function r(s,e){var w=document.createTreeWalker(document,NodeFilter.SHOW_COMMENT),a=null,b=null;while(w.nextNode()){var n=w.currentNode;if(n.data===s)a=n;if(n.data===e)b=n}return[a,b]}function patch(t,s,e,d){u(function(){var x=document.querySelector('template[id="'+t+'"]');if(!x)return false;var a=r(s,e),b=a[0],c=a[1];if(!b||!c||!c.parentNode)return false;var p=c.parentNode,n=b.nextSibling;while(n&&n!==c){var z=n.nextSibling;n.remove();n=z}p.insertBefore(x.content,c);x.remove();if(d){b.remove();c.remove()}return true})}window.${APPLY_PATCH_SSR_KEY}=function(i){patch(i,"${FALLBACK_START_SSR_MARKER}:"+i,"${FALLBACK_END_SSR_MARKER}:"+i,1)};window.${APPLY_ERROR_BOUNDARY_PATCH_SSR_KEY}=function(i){patch("vynn-eb-"+i,"${ERROR_BOUNDARY_START_SSR_MARKER}:"+i,"${ERROR_BOUNDARY_END_SSR_MARKER}:"+i,0)};window.${APPLY_HEAD_PATCH_SSR_KEY}=window.${APPLY_HEAD_PATCH_SSR_KEY}||function(h){var t=document.createElement("template");t.innerHTML=h;function k(n){var t=n.tagName.toLowerCase();if(t==="title")return"title";if(t==="meta"){if(n.hasAttribute("charset"))return"meta:charset";var v=n.getAttribute("name");if(v)return"meta:name:"+v.toLowerCase();v=n.getAttribute("property");if(v)return"meta:property:"+v.toLowerCase();v=n.getAttribute("http-equiv");if(v)return"meta:http-equiv:"+v.toLowerCase()}if(t==="link"){var r=(n.getAttribute("rel")||"").toLowerCase(),h=n.getAttribute("href")||"";return r==="canonical"?"link:canonical":"link:"+r+":"+h}return null}function preserve(e){if(!e.hasAttribute("key")){var f=document.head.querySelector('template[data-vynn-head-fallback]');if(!f){f=document.createElement("template");f.setAttribute("data-vynn-head-fallback","");document.head.append(f)}f.content.append(e)}else{e.remove()}}t.content.querySelectorAll("[data-vynn-head-replace]").forEach(function(n){var c=n.getAttribute("data-vynn-head-replace");document.head.querySelectorAll("meta[property]").forEach(function(e){var p="meta:property:"+(e.getAttribute("property")||"").toLowerCase();if(p===c||p.indexOf(c+":")===0)preserve(e)})});t.content.querySelectorAll("[key]").forEach(function(n){var v=n.getAttribute("key");document.head.querySelectorAll(n.tagName.toLowerCase()).forEach(function(e){if(e.getAttribute("key")===v||(!n.hasAttribute("data-vynn-head-replace")&&k(e)===v))preserve(e)})});t.content.querySelectorAll("[data-vynn-head-replace]").forEach(function(n){n.removeAttribute("data-vynn-head-replace")});document.head.querySelectorAll("[key]").forEach(function(n){n.remove()});document.head.append(t.content)};document.currentScript.remove();</script>`;
}
