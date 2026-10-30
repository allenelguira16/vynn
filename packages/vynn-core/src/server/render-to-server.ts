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

  const { result, headContext } = runWithOwner(owner, () => {
    setRenderMode(mode);

    const headContext = initializeHeadContext();

    initializeSsrModuleContext(ssrModules);
    initializeLazyContext();
    initializeAsyncContext();
    initializeErrorBoundaryContext();

    let result: Promise<string> | ReadableStream<Uint8Array>;

    switch (mode) {
      // @DEPRECATED: Sync will no longer be supported in favor of async and stream to fit well with $async
      case "async": {
        result = resolveAsync(App);
        break;
      }
      case "stream": {
        result = resolveStream(App, headContext);
        break;
      }
      default: {
        throw new Error(
          `[vynn]: Unsupported SSR render mode: ${String(mode)}`,
        );
      }
    }

    return { result, headContext };
  });

  return attachSsrHead(
    attachSsrModules(result, ssrModules),
    headContext,
  );
}
