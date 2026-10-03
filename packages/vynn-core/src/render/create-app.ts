import { JSX } from "../jsx-runtime";
import { resolveNode } from "./resolve-node";

/**
 * Creates a root application instance.
 *
 * The returned app can be mounted to a DOM target and later unmounted
 * to remove the rendered application nodes.
 *
 * @param App The root component to render.
 * @returns An app instance with `mount` and `unmount` methods.
 */
export function createApp(App: () => JSX.Element) {
  let cleanup: (() => void) | undefined;

  return {
    /**
     * Mounts the application into a DOM target.
     *
     * A selector string is resolved with `document.querySelector()`.
     * Existing children of the target are preserved when mounting.
     *
     * @param id The document, element, document fragment, or selector
     * identifying where the application should be mounted.
     */
    mount: (id: Document | HTMLElement | DocumentFragment | string): void => {
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

    /**
     * Unmounts the application and removes its rendered nodes.
     *
     * @throws Error when the application has not been mounted.
     */
    unmount: (): void => {
      if (!cleanup) {
        throw new Error("Can only unmount if the app is mounted");
      }

      cleanup();
    },
  };
}
