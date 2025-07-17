import { mountComponent, renderChildren } from "~/render";
import { JSX } from "~/types";
import {
  flattenArray,
  flattenDOMContents,
  flattenLazyDOMContents,
  setLazyDom,
  setSsrDomWalker,
} from "~/util";

/**
 * hydrate root app
 *
 * @param App - The app to render.
 */
export function hydrateApp(App: () => JSX.Element) {
  let cleanup: (() => void) | undefined;

  return {
    mount: (id: Document | HTMLElement | string) => {
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
      setLazyDom(lazyDom);
      setSsrDomWalker(flatDom.filter((node) => !flattenArray(lazyDom).flat().includes(node)));

      const app = mountComponent(App);
      cleanup = renderChildren(node, app);
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    },
  };
}
