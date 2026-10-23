import { createOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { setRenderMode } from "../context/render-mode";
import { resolveAsync } from "./render-to-server.async";
import { resolveStream } from "./render-to-server.stream";

export function renderToServer(
  App: () => JSX.Element,
  mode: "async" | "stream",
) {
  const owner = createOwner();
  owner.context.set("$async-values", []);
  owner.context.set("$async-id", 0);
  owner.context.set("$lazy-id", 0);

  return runWithOwner(owner, () => {
    setRenderMode(mode);

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
