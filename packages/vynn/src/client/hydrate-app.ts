import { flattenDOMContents, flattenLazyDOMContents } from "~/client/flat-dom-contents";
import { JSX } from "~/types/jsx";
import { setLazyDom, setSsrDomWalker } from "~/util/ssr-dom-walker";
import { flattenArray } from "~/util/to-array";

import { renderChildren } from "./render-children";
import { renderComponent } from "./render-component";

/**
 * hydrate root app
 *
 * @param App - The app to render.
 */
export function hydrateApp(App: () => JSX.Element) {
  let cleanup: (() => void) | undefined;

  return {
    mount: (id: Document | HTMLElement | string) => {
      const start = performance.now();
      try {
        let node: HTMLElement | null;

        if (id instanceof HTMLElement) {
          node = id;
        } else if (id instanceof Document) {
          node = id.documentElement;
        } else {
          node = document.querySelector(id);
        }

        if (!(node instanceof HTMLElement)) throw new Error("Node must be of type Element");
        const flatDom = flattenDOMContents(node);
        const lazyDom = flattenLazyDOMContents(node);
        // console.log(lazyDom);
        setLazyDom(lazyDom);
        setSsrDomWalker(flatDom.filter((node) => !flattenArray(lazyDom).flat().includes(node)));
        // setSsrDomWalker(flatDom);

        const app = renderComponent(App);
        cleanup = renderChildren(node, app);
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
