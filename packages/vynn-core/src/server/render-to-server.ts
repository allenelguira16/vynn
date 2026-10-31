import { createOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { RenderMode, setRenderMode } from "../context/render-mode";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { initializeAsyncContext } from "../context/async-context";
import { initializeLazyContext } from "../context/lazy-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeSsrModuleContext } from "../context/ssr-module-context";
import { attachSsrModules } from "./preload.ssr-modules";
import { initializeHeadContext } from "../context/head-context";
import { attachSsrHead } from "./head";

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

    let result: Promise<string> | ReadableStream<Uint8Array>;

    switch (mode) {
      case "async": {
        result = resolveAsync(App);
        break;
      }
      case "stream": {
        result = resolveStream(App);
        break;
      }
      default: {
        throw new Error(`[vynn]: Unsupported SSR render mode: ${String(mode)}`);
      }
    }

    return attachSsrHead(attachSsrModules(result, ssrModules));
  });
}
