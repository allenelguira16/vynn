import type { Owner } from "../life-cycle/owner";

import {
  cancelSsrErrorBoundaryBoundaries,
  createSsrBoundaryCancellation,
  getSsrErrorBoundary,
  normalizeSsrResult,
  renderSsrBoundaryContent,
  renderSsrErrorFallback,
  renderSsrComponent,
  replaceSsrMarkerRange,
} from "../context/ssr-string-context";
import type {
  SsrStringBoundary,
  SsrStringDynamicSlot,
  SsrStringRenderState,
} from "../context/ssr-string-context";
import { NotReadyError } from "../reactivity/not-ready-error";
import { runWithOwner } from "../life-cycle/owner";
import { renderSsrStringUtilities } from "./ssr-string-utilities";
import { renderHeadPatch, type SsrHeadManager } from "./head";

const encoder = new TextEncoder();

const asyncStart = (id: number) => `<!--vynn-ssr-start:${id}-->`;
const asyncEnd = (id: number) => `<!--vynn-ssr-end:${id}-->`;
const errorStart = (id: number) => `<!--vynn-ssr-error-start:${id}-->`;
const errorEnd = (id: number) => `<!--vynn-ssr-error-end:${id}-->`;

function markResolvedBoundaryContent(
  boundary: SsrStringBoundary,
  html: string,
): string {
  return boundary.kind === "await" ? "<!--vynn-await:resolved-->" + html : html;
}

function renderInitial(
  App: () => unknown,
  owner: Owner,
  state: SsrStringRenderState,
): string {
  let boundary = state.rootBoundary;
  if (!boundary) {
    boundary = {
      id: state.nextBoundaryId++,
      kind: "root",
      owner,
      render: App,
      fallback: () => "",
      fallbackKey: {},
      componentKey: App,
      children: new Set(),
      ...createSsrBoundaryCancellation(),
      cancelled: false,
      promises: new Set(),
      slots: [],
      nextSlotId: 0,
      content: "",
      requiresRerender: false,
      active: false,
      version: 0,
    };
    state.rootBoundary = boundary;
    state.boundaries.unshift(boundary);
  }

  boundary.render = App;
  let content = "";
  try {
    content = renderSsrBoundaryContent(boundary);
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;
    boundary.promises.add(error.promise);
    boundary.requiresRerender = true;
  }

  if (boundary.promises.size === 0) {
    boundary.active = false;
    return content;
  }

  if (state.mode === "sync") {
    boundary.active = false;
    return boundary.content;
  }

  boundary.active = true;
  boundary.version++;
  return asyncStart(boundary.id) + boundary.content + asyncEnd(boundary.id);
}

function cancelBoundaryTree(boundary: SsrStringBoundary): void {
  boundary.cancelled = true;
  boundary.cancel();
  boundary.active = false;
  for (const child of boundary.children) cancelBoundaryTree(child);
}

function hasBlockedBoundaryAncestor(boundary: SsrStringBoundary): boolean {
  let parent = boundary.parent;
  while (parent) {
    if (parent.cancelled) {
      cancelBoundaryTree(boundary);
      return true;
    }
    if (parent.active) return true;
    parent = parent.parent;
  }
  return boundary.cancelled;
}

function isOwnerWithin(owner: Owner, ancestor: Owner): boolean {
  let current: Owner | null = owner;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function cancelBoundaryOwnersWithin(
  boundary: SsrStringBoundary,
  owner: Owner,
): void {
  for (const child of boundary.children) {
    if (isOwnerWithin(child.owner, owner)) {
      cancelBoundaryTree(child);
    } else {
      cancelBoundaryOwnersWithin(child, owner);
    }
  }
}

/**
 * Resolve a dynamic expression without rerunning the component that produced
 * it. If the expression suspends again, wait on that resource and retry only
 * this saved getter.
 */
async function resolveDynamicSlot(
  slot: SsrStringDynamicSlot,
  boundary: SsrStringBoundary,
  shouldStop: () => boolean,
): Promise<string | null> {
  while (true) {
    if (shouldStop()) return null;
    const pending = [...slot.promises];
    slot.promises.clear();
    if (pending.length > 0) {
      await Promise.race([
        Promise.allSettled(pending),
        boundary.cancelPromise,
      ]);
    }
    if (shouldStop() || boundary.cancelled) return null;

    try {
      const value = renderSsrComponent(slot.owner, slot.render, slot);
      return normalizeSsrResult(value);
    } catch (error) {
      if (!(error instanceof NotReadyError)) throw error;
      slot.promises.add(error.promise);
      boundary.promises.add(error.promise);
    }
  }
}

/** Resolve one Await/root boundary, preserving component instances where possible. */
async function resolveBoundary(
  boundary: SsrStringBoundary,
  shouldStop: () => boolean = () => false,
): Promise<{ html: string; errorBoundaryId?: number } | null> {
  if (shouldStop() || boundary.cancelled) return null;
  try {
    if (boundary.requiresRerender) {
      while (boundary.requiresRerender) {
        const pending = [...boundary.promises];
        boundary.promises.clear();
        if (pending.length > 0) {
          await Promise.race([
            Promise.allSettled(pending),
            boundary.cancelPromise,
          ]);
        }
        if (shouldStop() || boundary.cancelled) return null;

        try {
          renderSsrBoundaryContent(boundary);
        } catch (error) {
          if (!(error instanceof NotReadyError)) throw error;
          boundary.promises.add(error.promise);
          boundary.requiresRerender = true;
        }
      }
    }

    let html = boundary.content;

    // A slot can reveal more dynamic slots (for example a mapped JSX result),
    // so walk the live array rather than a snapshot.
    for (let index = 0; index < boundary.slots.length; index++) {
      const slot = boundary.slots[index];
      if (!slot) continue;
      const start = "<!--vynn-ssr-slot-start:" + boundary.id + ":" + slot.id + "-->";
      const end = "<!--vynn-ssr-slot-end:" + boundary.id + ":" + slot.id + "-->";

      // A preceding Catch patch can remove pending slots from its failed child range.
      if (slot.kind === "attribute") {
        if (!slot.marker || !html.includes(slot.marker)) continue;
      } else if (!html.includes(start) || !html.includes(end)) {
        continue;
      }

      try {
        const slotHtml = await resolveDynamicSlot(slot, boundary, shouldStop);
        if (slotHtml === null || shouldStop()) return null;
        if (slot.kind === "attribute") {
          html = html.replace(slot.marker!, slotHtml);
        } else {
          html = replaceSsrMarkerRange(html, start, end, slotHtml);
        }
      } catch (error) {
        if (!(error instanceof Error) || !slot.errorBoundary) throw error;

        runWithOwner(slot.owner, () => slot.errorBoundary!(error));
        const catchBoundary = runWithOwner(slot.owner, () =>
          getSsrErrorBoundary(slot.errorBoundary),
        );
        if (!catchBoundary) throw error;

        cancelSsrErrorBoundaryBoundaries(catchBoundary);
        const fallbackHtml = runWithOwner(slot.owner, () =>
          renderSsrErrorFallback(catchBoundary),
        );
        const catchStart = errorStart(catchBoundary.id);
        const catchEnd = errorEnd(catchBoundary.id);

        if (html.includes(catchStart) && html.includes(catchEnd)) {
          // Catch was created inside this buffered boundary, so its range is
          // present locally and can be replaced before the boundary patch.
          // Cancel nested Await boundaries whose output lived inside the range.
          cancelBoundaryOwnersWithin(boundary, catchBoundary.owner);
          html = replaceSsrMarkerRange(html, catchStart, catchEnd, fallbackHtml);
        } else {
          // Catch wraps this Await/root boundary. Its markers are in the outer
          // document string, so tell the renderer to patch the Catch range.
          boundary.content = fallbackHtml;
          cancelBoundaryTree(boundary);
          return { html: fallbackHtml, errorBoundaryId: catchBoundary.id };
        }
      }
    }

    boundary.content = html;
    boundary.active = false;
    return { html };
  } catch (error) {
    if (shouldStop()) return null;
    if (error instanceof NotReadyError) {
      boundary.promises.add(error.promise);
      boundary.requiresRerender = true;
      boundary.active = true;
      boundary.version++;
      return await resolveBoundary(boundary, shouldStop);
    }

    if (error instanceof Error && boundary.errorBoundary) {
      runWithOwner(boundary.owner, () => boundary.errorBoundary!(error));
      const catchBoundary = runWithOwner(boundary.owner, () =>
        getSsrErrorBoundary(boundary.errorBoundary),
      );
      if (catchBoundary) {
        cancelSsrErrorBoundaryBoundaries(catchBoundary);
        cancelBoundaryTree(boundary);
        return {
          html: runWithOwner(boundary.owner, () => renderSsrErrorFallback(catchBoundary)),
          errorBoundaryId: catchBoundary.id,
        };
      }
    }

    throw error;
  }
}

async function resolveAllBoundaries(
  initialHtml: string,
  state: SsrStringRenderState,
  owner: Owner,
): Promise<string> {
  let html = initialHtml;
  const processed = new Map<SsrStringBoundary, number>();
  const pending = new Map<
    SsrStringBoundary,
    Promise<{
      boundary: SsrStringBoundary;
      result?: { html: string; errorBoundaryId?: number } | null;
      error?: unknown;
      failed: boolean;
    }>
  >();
  let failed = false;

  const startReadyBoundaries = () => {
    for (const boundary of state.boundaries) {
      if (
        !boundary.active ||
        hasBlockedBoundaryAncestor(boundary) ||
        processed.get(boundary) === boundary.version ||
        pending.has(boundary)
      ) {
        continue;
      }

      processed.set(boundary, boundary.version);

      const task = resolveBoundary(boundary, () => failed).then(
        (result) => ({
          boundary,
          result,
          failed: false,
        }),
        (error: unknown) => {
          failed = true;
          for (const candidate of state.boundaries) {
            cancelBoundaryTree(candidate);
          }

          return {
            boundary,
            error,
            failed: true,
          };
        },
      );

      pending.set(boundary, task);
    }
  };

  // Start eligible siblings together, then advance as each one finishes.
  // This lets a newly-unblocked child begin while unrelated siblings remain
  // pending, without allowing it to overtake its own parent.
  while (true) {
    startReadyBoundaries();

    if (pending.size === 0) break;

    const settled = await Promise.race(pending.values());
    pending.delete(settled.boundary);

    if (settled.failed) {
      throw settled.error;
    }

    if (!settled.result) continue;

    if (settled.result.errorBoundaryId !== undefined) {
      html = replaceSsrMarkerRange(
        html,
        errorStart(settled.result.errorBoundaryId),
        errorEnd(settled.result.errorBoundaryId),
        settled.result.html,
      );
    } else {
      html = replaceSsrMarkerRange(
        html,
        asyncStart(settled.boundary.id),
        asyncEnd(settled.boundary.id),
        markResolvedBoundaryContent(settled.boundary, settled.result.html),
      );
    }
  }

  return html + runWithOwner(owner, renderSsrStringUtilities);
}

/** Synchronous rendering returns the already-rendered string and Await fallbacks. */
export function resolveSsrStringSync(
  App: () => unknown,
  owner: Owner,
  state: SsrStringRenderState,
): string {
  const html = renderInitial(App, owner, state);
  if (state.boundaries.some((boundary) => boundary.active)) {
    throw new Error("[Vynn SSR] Synchronous rendering cannot contain queued async boundaries.");
  }
  return html + runWithOwner(owner, renderSsrStringUtilities);
}

/** Async rendering waits for every registered boundary and returns final HTML. */
export async function resolveSsrStringAsync(
  App: () => unknown,
  owner: Owner,
  state: SsrStringRenderState,
): Promise<string> {
  const html = renderInitial(App, owner, state);
  return resolveAllBoundaries(html, state, owner);
}

/**
 * Streaming SSR emits the initial HTML immediately, then replaces async
 * boundary ranges as their promises settle. No server-side DOM node tree is
 * created; every renderer operation works on strings.
 */
export function resolveSsrStringStream(
  App: () => unknown,
  owner: Owner,
  state: SsrStringRenderState,
  head: SsrHeadManager,
  disposeRenderOwner: () => void,
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let cancelled = false;
  let closed = false;
  let ownerDisposed = false;
  let previousHead = "";

  const releaseOwner = () => {
    if (ownerDisposed) return;
    ownerDisposed = true;
    disposeRenderOwner();
  };

  const enqueue = (value: string) => {
    if (!cancelled && !closed && value && controller) {
      controller.enqueue(encoder.encode(value));
    }
  };

  const fail = (error: unknown) => {
    if (closed || cancelled) return;
    closed = true;
    for (const boundary of state.boundaries) cancelBoundaryTree(boundary);
    controller?.error(error);
    releaseOwner();
  };

  const enqueueHeadUpdate = () => {
    const next = head.render();
    if (next === previousHead) return;
    previousHead = next;
    enqueue(renderHeadPatch(next));
  };

  async function run(): Promise<void> {
    try {
      const initial = renderInitial(App, owner, state);
      previousHead = head.render();
      enqueue(renderPatchRuntime() + initial);

      const processed = new Map<SsrStringBoundary, number>();
      const pending = new Map<
        SsrStringBoundary,
        Promise<{
          boundary: SsrStringBoundary;
          result?: { html: string; errorBoundaryId?: number } | null;
          error?: unknown;
          failed: boolean;
        }>
      >();

      const startReadyBoundaries = () => {
        for (const boundary of state.boundaries) {
          if (
            !boundary.active ||
            hasBlockedBoundaryAncestor(boundary) ||
            processed.get(boundary) === boundary.version ||
            pending.has(boundary)
          ) {
            continue;
          }

          processed.set(boundary, boundary.version);

          const task = resolveBoundary(
            boundary,
            () => cancelled || closed,
          ).then(
            (result) => ({
              boundary,
              result,
              failed: false,
            }),
            (error: unknown) => {
              for (const candidate of state.boundaries) {
                cancelBoundaryTree(candidate);
              }

              return {
                boundary,
                error,
                failed: true,
              };
            },
          );

          pending.set(boundary, task);
        }
      };

      while (true) {
        if (cancelled || closed) return;

        startReadyBoundaries();

        if (pending.size === 0) break;

        // Advance the stream as soon as any boundary finishes. Waiting for
        // every sibling here would delay newly-unblocked nested boundaries
        // behind unrelated slow work in the same batch.
        const settled = await Promise.race(pending.values());
        pending.delete(settled.boundary);

        if (settled.failed) {
          throw settled.error;
        }

        if (!settled.result || cancelled || closed) continue;

        if (settled.result.errorBoundaryId !== undefined) {
          enqueue(renderErrorPatch(settled.result.errorBoundaryId, settled.result.html));
        } else {
          enqueue(renderAsyncPatch(
            settled.boundary.id,
            markResolvedBoundaryContent(settled.boundary, settled.result.html),
          ));
        }
        enqueueHeadUpdate();
      }

      enqueue(runWithOwner(owner, renderSsrStringUtilities));
      if (!cancelled && !closed) {
        closed = true;
        controller?.close();
      }
    } catch (error) {
      fail(error);
    } finally {
      if (closed || cancelled) releaseOwner();
    }
  }
  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      void run();
    },
    cancel() {
      cancelled = true;
      for (const boundary of state.boundaries) cancelBoundaryTree(boundary);
      releaseOwner();
    },
  });
}

function renderAsyncPatch(id: number, html: string): string {
  return `<template data-vynn-ssr-patch="${id}">${html}</template><script>window.__vynnApplySsrPatch&&window.__vynnApplySsrPatch(${id});document.currentScript.remove();</script>`;
}

function renderErrorPatch(id: number, html: string): string {
  return `<template data-vynn-ssr-error-patch="${id}">${html}</template><script>window.__vynnApplySsrErrorPatch&&window.__vynnApplySsrErrorPatch(${id});document.currentScript.remove();</script>`;
}

function renderPatchRuntime(): string {
  return `<script>
(function(){
  function findRange(start,end){
    var walker=document.createTreeWalker(document,NodeFilter.SHOW_COMMENT),first=null,last=null;
    while(walker.nextNode()){
      var node=walker.currentNode;
      if(node.data===start)first=node;
      else if(node.data===end&&first){last=node;break;}
    }
    return first&&last?[first,last]:null;
  }
  function apply(templateSelector,start,end,removeAnchors){
    var template=document.querySelector(templateSelector);
    if(!template)return false;
    var range=findRange(start,end);
    if(!range)return false;
    var first=range[0],last=range[1],parent=last.parentNode;
    if(!parent)return false;
    var node=first.nextSibling;
    while(node&&node!==last){var next=node.nextSibling;node.remove();node=next;}
    parent.insertBefore(template.content,last);
    template.remove();
    if(removeAnchors){first.remove();last.remove();}
    return true;
  }
  window.__vynnApplySsrPatch=function(id){
    apply('template[data-vynn-ssr-patch="'+id+'"]',"vynn-ssr-start:"+id,"vynn-ssr-end:"+id,true);
  };
  window.__vynnApplySsrErrorPatch=function(id){
    apply('template[data-vynn-ssr-error-patch="'+id+'"]',"vynn-ssr-error-start:"+id,"vynn-ssr-error-end:"+id,true);
  };
})();
document.currentScript.remove();
</script>`;
}
