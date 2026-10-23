import { createOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { RenderMode, setRenderMode } from "../context/render-mode";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { initializeAsyncID } from "../context/async-id";
import { initializeLazyID } from "../context/lazy-id";
import { initializeAsyncValues } from "../context/async-values";

export function renderToServer(App: () => JSX.Element, mode: RenderMode) {
  const owner = createOwner();

  return runWithOwner(owner, () => {
    setRenderMode(mode);
    initializeAsyncValues();

    initializeAsyncID();
    initializeLazyID();

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
