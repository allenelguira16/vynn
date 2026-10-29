import { createOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { RenderMode, setRenderMode } from "../context/render-mode";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";
import { initializeAsyncContext } from "../context/async-context";
import { initializeLazyContext } from "../context/lazy-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";

const usedLazyModulesByRender = new WeakMap<object, Set<string>>();

/** @internal Returns the live set of lazy module IDs used by a server render result. */
export function getServerRenderLazyModules(result: unknown): Set<string> {
  if (
    (typeof result !== "object" && typeof result !== "function") ||
    result === null
  ) {
    return new Set();
  }

  return usedLazyModulesByRender.get(result as object) ?? new Set();
}

export function renderToServer(App: () => JSX.Element, mode: RenderMode) {
  const owner = createOwner();
  let usedLazyModules: Set<string> | undefined;

  const result = runWithOwner(owner, () => {
    setRenderMode(mode);

    usedLazyModules = initializeLazyContext();
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

  if (
    usedLazyModules &&
    result !== null &&
    (typeof result === "object" || typeof result === "function")
  ) {
    usedLazyModulesByRender.set(result as object, usedLazyModules);
  }

  return result;
}
