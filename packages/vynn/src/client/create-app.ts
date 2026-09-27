import { JSX } from "../jsx";
import { resolveNode } from "./resolve-node";

/**
 * create root app
 *
 * @param App - The app to render.
 */
export function createApp(App: () => JSX.Element) {
  let cleanup: (() => void) | undefined;

  return {
    mount: (id: Document | HTMLElement | DocumentFragment | string) => {
      // const start = performance.now();
      let node: DocumentFragment | HTMLElement | null;

      if (id instanceof HTMLElement || id instanceof DocumentFragment) {
        node = id;
      } else if (id instanceof Document) {
        node = id.documentElement;
      } else {
        node = document.querySelector(id) as typeof node;
      }

      if (node instanceof HTMLElement || node instanceof DocumentFragment) {
        const app = resolveNode(App);
        const nodes = app.map((element) => element);
        node.append(...nodes);

        cleanup = () => {
          node.replaceChildren();
        };
      } else {
        throw new Error("Node must be of type Element");
      }
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    },
  };
}
