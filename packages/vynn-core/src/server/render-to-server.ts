import "../runtime/server/context";

import type { JSX } from "../types/jsx";

import { initializeAsyncHydrationRuntime } from "../runtime/async/hydration";
import { initializeErrorBoundaryContext } from "../context/error-boundary";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { type RenderMode, setRenderMode } from "../runtime/render-mode";
import { getSsrModuleContext, initializeSsrModuleContext } from "../context/ssr-modules";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import {
  createRuntimeContext,
  getRuntimeContextStore,
  runWithRuntimeContext,
} from "../runtime/context";
import { createSsrHeadManager, type SsrHeadManager } from "./head";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { resolveSync } from "./render-to-server.sync";
import {
  createServerFunctionContext,
  runWithServerFunctionContext,
  type RequestContext,
} from "../runtime/server/function-context";

export interface SsrRenderResult<TBody> {
  readonly body: TBody;
  readonly head: SsrHeadManager;
  readonly modules: ReadonlySet<string>;
  /** Request metadata written by server functions during this SSR render. */
  readonly response?: RequestContext["response"];
}

export function renderToServer(
  App: () => JSX.Element,
  mode: "sync",
  request?: Request,
): SsrRenderResult<string>;
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
export function renderToServer(App: () => JSX.Element, mode: RenderMode, request?: Request) {
  // Each render owns an independent root. The optional request is supplied
  // explicitly by the HTTP adapter and is never inherited from another render.
  const owner = createOwner(null);
  const requestContext = request ? createServerFunctionContext({ request }) : undefined;

  const render = () =>
    runWithRuntimeContext(
      createRuntimeContext(getRuntimeContextStore() ?? null),
      () => runWithOwner(owner, () => {
      let disposeOnExit = true;

      try {
        setRenderMode(mode);

        const headContext = initializeHeadContext();
        initializeSsrModuleContext();
        initializeLazyContext();
        initializeAsyncHydrationRuntime();
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
            const body = resolveSync(App, owner);
            return createResult(body);
          }

          case "async": {
            const body = resolveAsync(App, owner);
            disposeOnExit = false;

            return body.then((html) => createResult(html)).finally(() => disposeOwner(owner));
          }

          case "stream": {
            const body = resolveStream(App, head, () => disposeOwner(owner));
            disposeOnExit = false;

            return createResult(body);
          }

          default: {
            throw new Error("[vynn]: Unsupported SSR render mode: " + String(mode));
          }
        }
      } finally {
        if (disposeOnExit) {
          disposeOwner(owner);
        }
      }
    }),
    );

  return requestContext ? runWithServerFunctionContext(requestContext, render) : render();
}
