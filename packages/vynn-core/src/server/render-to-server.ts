import type { JSX } from "../types/jsx";

import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { getHeadContext, initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { type RenderMode, setRenderMode } from "../context/render-mode";
import { initializeSsrModuleContext } from "../context/ssr-module-context";
import { createOwner, runWithOwner } from "../life-cycle/owner";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { resolveSync } from "./render-to-server.sync";
import { setSsrRequestHead } from "./ssr-request-context";

export function renderToServer(App: () => JSX.Element, mode: "sync"): string;
export function renderToServer(App: () => JSX.Element, mode: "async"): Promise<string>;
export function renderToServer(App: () => JSX.Element, mode: "stream"): ReadableStream<Uint8Array>;
export function renderToServer(
  App: () => JSX.Element,
  mode: RenderMode,
): string | Promise<string> | ReadableStream<Uint8Array>;
export function renderToServer(App: () => JSX.Element, mode: RenderMode) {
  const owner = createOwner();
  const ssrModules = new Set<string>();

  return runWithOwner(owner, () => {
    setRenderMode(mode);

    initializeHeadContext();
    setSsrRequestHead(getHeadContext());

    initializeSsrModuleContext(ssrModules);
    initializeLazyContext();
    initializeAsyncContext();
    initializeErrorBoundaryContext();

    switch (mode) {
      case "sync":
        return resolveSync(App);

      case "async":
        return resolveAsync(App);

      case "stream":
        return resolveStream(App);

      default:
        throw new Error(`[vynn]: Unsupported SSR render mode: ${String(mode)}`);
    }
  });
}
