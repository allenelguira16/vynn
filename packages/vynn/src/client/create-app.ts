import { JSX } from "~/types/jsx";

import { renderChildren } from "./render-children";
import { renderComponent } from "./render-component";

/**
 * create root app
 *
 * @param App - The app to render.
 */
export function createApp(App: () => JSX.Element) {
  let cleanup: (() => void) | undefined;

  return {
    mount: (id: Document | HTMLElement | DocumentFragment | string) => {
      const start = performance.now();
      try {
        let node: DocumentFragment | HTMLElement | null;

        if (id instanceof HTMLElement || id instanceof DocumentFragment) {
          node = id;
        } else if (id instanceof Document) {
          node = id.documentElement;
        } else {
          node = document.querySelector(id) as typeof node;
        }

        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          const app = renderComponent(App);
          cleanup = renderChildren(node, app);
        } else {
          throw new Error("Node must be of type Element");
        }
      } finally {
        requestAnimationFrame(() => {
          const duration = (performance.now() - start) / 1000;
          console.log("after paint:", duration);
        });
        requestIdleCallback(() => {
          const duration = (performance.now() - start) / 1000;
          console.log("idle after hydration:", duration);
        });
      }
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    },
  };
}
