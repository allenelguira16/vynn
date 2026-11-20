import type { RenderMode } from "../context/render-mode";
import type { SsrRenderResult } from "./ssr-types";

import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { setRenderMode } from "../context/render-mode";
import { initializeSsrStringContext } from "../context/ssr-string-context";
import { getSsrModuleContext, initializeSsrModuleContext } from "../context/ssr-module-context";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { createSsrHeadManager } from "./head";
import {
  createServerFunctionContext,
  runWithServerFunctionContext,
} from "./server-function-context";
import {
  resolveSsrStringAsync,
  resolveSsrStringStream,
  resolveSsrStringSync,
} from "./ssr-renderer";

export function renderToServerString(
  App: () => unknown,
  mode: "sync",
  request?: Request,
): SsrRenderResult<string>;
export function renderToServerString(
  App: () => unknown,
  mode: "async",
  request?: Request,
): Promise<SsrRenderResult<string>>;
export function renderToServerString(
  App: () => unknown,
  mode: "stream",
  request?: Request,
): SsrRenderResult<ReadableStream<Uint8Array>>;
export function renderToServerString(
  App: () => unknown,
  mode: RenderMode,
  request?: Request,
):
  | SsrRenderResult<string>
  | Promise<SsrRenderResult<string>>
  | SsrRenderResult<ReadableStream<Uint8Array>>;
export function renderToServerString(App: () => unknown, mode: RenderMode, request?: Request) {
  const owner = createOwner(null);
  const requestContext = request ? createServerFunctionContext({ request }) : undefined;

  const render = () =>
    runWithOwner(owner, () => {
      let disposeOnExit = true;

      try {
        setRenderMode(mode);
        const headContext = initializeHeadContext();
        initializeSsrModuleContext();
        initializeLazyContext();
        initializeAsyncContext();
        initializeErrorBoundaryContext();
        const state = initializeSsrStringContext(mode);

        const head = createSsrHeadManager(headContext);
        const modules = getSsrModuleContext();
        const createResult = <TBody>(body: TBody): SsrRenderResult<TBody> => ({
          body,
          head,
          modules,
          ...(requestContext ? { response: requestContext.response } : {}),
        });

        switch (mode) {
          case "sync":
            return createResult(resolveSsrStringSync(App, owner, state));

          case "async": {
            const body = resolveSsrStringAsync(App, owner, state);
            disposeOnExit = false;
            return body
              .then((html) => createResult(html))
              .finally(() => disposeOwner(owner));
          }

          case "stream": {
            const body = resolveSsrStringStream(App, owner, state, head, () => disposeOwner(owner));
            disposeOnExit = false;
            return createResult(body);
          }

          default:
            throw new Error("[vynn]: Unsupported SSR render mode: " + String(mode));
        }
      } finally {
        if (disposeOnExit) disposeOwner(owner);
      }
    });

  return requestContext ? runWithServerFunctionContext(requestContext, render) : render();
}
