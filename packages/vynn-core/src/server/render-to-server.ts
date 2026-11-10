import type { JSX } from "../types/jsx";

import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { type RenderMode, setRenderMode } from "../context/render-mode";
import { getSsrModuleContext, initializeSsrModuleContext } from "../context/ssr-module-context";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import {
  createServerFunctionContext,
  runWithServerFunctionContext,
  type RequestContext,
} from "./server-function-context";
import { createSsrHeadManager, type SsrHeadManager } from "./head";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { resolveSync } from "./render-to-server.sync";

export interface SsrRenderResult<TBody> {
  readonly body: TBody;
  readonly head: SsrHeadManager;
  readonly modules: ReadonlySet<string>;
  /** Request metadata written by server functions during this SSR render. */
  readonly response?: RequestContext["response"];
}

export function renderToServer(App: () => JSX.Element, mode: "sync", request?: Request): SsrRenderResult<string>;
export function renderToServer(
  App: () => JSX.Element,
  mode: "async",
  request?: Request,
): Promise<SsrRenderResult<string>>;
export function renderToServer(
  App: () => JSX.Element,
  mode: "stream",
  request?: Request,
): SsrRenderResult<ReadableStream<Uint8Array>>;
export function renderToServer(
  App: () => JSX.Element,
  mode: RenderMode,
  request?: Request,
):
  | SsrRenderResult<string>
  | Promise<SsrRenderResult<string>>
  | SsrRenderResult<ReadableStream<Uint8Array>>;
export function renderToServer(
  App: () => JSX.Element,
  mode: RenderMode,
  request?: Request,
) {
  // Each render owns an independent root. The optional request is supplied
  // explicitly by the HTTP adapter and is never inherited from another render.
  const owner = createOwner(null);
  const requestContext = request
    ? createServerFunctionContext({ request })
    : undefined;

  const render = () => runWithOwner(owner, () => {
    let disposeOnExit = true;

    try {
      setRenderMode(mode);

      const headContext = initializeHeadContext();
      initializeSsrModuleContext();
      initializeLazyContext();
      initializeAsyncContext();
      initializeErrorBoundaryContext();

      const head = createSsrHeadManager(headContext);
      const modules = getSsrModuleContext();
      const createResult = <TBody>(body: TBody): SsrRenderResult<TBody> => ({
        body,
        head,
        modules,
        ...(requestContext ? { response: requestContext.response } : {}),
      });

      switch (mode) {
        case "sync": {
          const body = resolveSync(App);
          return createResult(body);
        }

        case "async": {
          const body = resolveAsync(App, owner);
          disposeOnExit = false;

          return body
            .then((html) => createResult(html))
            .finally(() => disposeOwner(owner));
        }

        case "stream": {
          const body = resolveStream(App, head, () => disposeOwner(owner));
          disposeOnExit = false;

          return createResult(body);
        }

        default:
          throw new Error("[vynn]: Unsupported SSR render mode: " + String(mode));
      }
    } finally {
      if (disposeOnExit) {
        disposeOwner(owner);
      }
    }
  });

  return requestContext
    ? runWithServerFunctionContext(requestContext, render)
    : render();
}
