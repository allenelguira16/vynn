import type { JSX } from "../types/jsx";

import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { initializeSsrPortalContext } from "../context/ssr-portal-context";
import { type RenderMode, setRenderMode } from "../context/render-mode";
import { getSsrModuleContext, initializeSsrModuleContext } from "../context/ssr-module-context";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { createSsrHeadManager, type SsrHeadManager } from "./head";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { resolveSync } from "./render-to-server.sync";

export interface SsrRenderResult<TBody> {
  readonly body: TBody;
  readonly head: SsrHeadManager;
  readonly modules: ReadonlySet<string>;
}

export function renderToServer(App: () => JSX.Element, mode: "sync"): SsrRenderResult<string>;
export function renderToServer(
  App: () => JSX.Element,
  mode: "async",
): Promise<SsrRenderResult<string>>;
export function renderToServer(
  App: () => JSX.Element,
  mode: "stream",
): SsrRenderResult<ReadableStream<Uint8Array>>;
export function renderToServer(
  App: () => JSX.Element,
  mode: RenderMode,
):
  | SsrRenderResult<string>
  | Promise<SsrRenderResult<string>>
  | SsrRenderResult<ReadableStream<Uint8Array>>;
export function renderToServer(App: () => JSX.Element, mode: RenderMode) {
  // Each render owns an independent root. It never inherits a request or
  // component Owner from the caller.
  const owner = createOwner(null);

  return runWithOwner(owner, () => {
    let disposeOnExit = true;

    try {
      setRenderMode(mode);

      const headContext = initializeHeadContext();
      initializeSsrModuleContext();
      initializeLazyContext();
      initializeSsrPortalContext();
      initializeAsyncContext();
      initializeErrorBoundaryContext();

      const head = createSsrHeadManager(headContext);
      const modules = getSsrModuleContext();

      switch (mode) {
        case "sync": {
          const body = resolveSync(App);
          return { body, head, modules } satisfies SsrRenderResult<string>;
        }

        case "async": {
          const body = resolveAsync(App, owner);
          disposeOnExit = false;

          return body
            .then((html) => ({ body: html, head, modules }) satisfies SsrRenderResult<string>)
            .finally(() => disposeOwner(owner));
        }

        case "stream": {
          const body = resolveStream(App, head, () => disposeOwner(owner));
          disposeOnExit = false;

          return {
            body,
            head,
            modules,
          } satisfies SsrRenderResult<ReadableStream<Uint8Array>>;
        }

        default:
          throw new Error(`[vynn]: Unsupported SSR render mode: ${String(mode)}`);
      }
    } finally {
      if (disposeOnExit) {
        disposeOwner(owner);
      }
    }
  });
}
