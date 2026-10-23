import { createOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { RenderMode, setRenderMode } from "../context/render-mode";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { initializeAsyncContext } from "../context/async-context";
import { initializeLazyContext } from "../context/lazy-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";

export function renderToServer(App: () => JSX.Element, mode: RenderMode) {
  const owner = createOwner();

  return runWithOwner(owner, () => {
    setRenderMode(mode);

    initializeLazyContext();
    initializeAsyncContext();
    initializeErrorBoundaryContext();

    switch (mode) {
      // @DEPRECATED: Sync will no longer be supported in favor of async and stream to fit well with $async
      // case "sync": {
      //   return resolveSync(App);
      // }
      case "async": {
        return resolveAsync(App);
      }
      case "stream": {
        return resolveStream(App);
      }
    }
  });
}
