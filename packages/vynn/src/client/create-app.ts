import { renderChildren } from "~/render/dom/render-children";
import { mountComponent } from "~/render/mount-component/mount-component";
import { JSX } from "~/types/jsx";

/**
 * create root app
 *
 * @param App - The app to render.
 */
export function createApp(App: () => JSX.Element) {
  let cleanup: (() => void) | undefined;

  return {
    mount: (id: Document | HTMLElement | DocumentFragment | string) => {
      let node: DocumentFragment | HTMLElement | null;

      if (id instanceof HTMLElement || id instanceof DocumentFragment) {
        node = id;
      } else if (id instanceof Document) {
        node = id.documentElement;
      } else {
        node = document.querySelector(id) as typeof node;
      }

      if (node instanceof HTMLElement || node instanceof DocumentFragment) {
        const app = mountComponent(App);
        cleanup = renderChildren(node, app);
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
