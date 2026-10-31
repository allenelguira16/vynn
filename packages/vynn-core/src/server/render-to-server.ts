import { createOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { setRenderMode, type RenderMode } from "../context/render-mode";
import { resolveSync } from "./render-to-server.sync";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { initializeAsyncContext } from "../context/async-context";
import { initializeLazyContext } from "../context/lazy-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeSsrModuleContext } from "../context/ssr-module-context";
import { initializeHeadContext } from "../context/head-context";
import { getHeadContext } from "../context/head-context";
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

    initializeSsrModuleContext(ssrModules);
    initializeLazyContext();
    initializeAsyncContext();
    initializeErrorBoundaryContext();

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
