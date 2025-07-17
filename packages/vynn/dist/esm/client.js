import { d as setSsrDomWalker, z as flattenArray, A as mountComponent, B as renderChildren, C as setLazyDom } from './chunks/portal-ZgJGVtMZ.js';
export { D as createApp } from './chunks/portal-ZgJGVtMZ.js';
import { f as flattenDOMContents, a as flattenLazyDOMContents } from './chunks/flat-dom-contents-CeIUQYJZ.js';

function hydrateApp(App) {
  let cleanup;
  return {
    mount: (id) => {
      let node;
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
      setSsrDomWalker(flatDom.filter((node2) => !flattenArray(lazyDom).flat().includes(node2)));
      const app = mountComponent(App);
      cleanup = renderChildren(node, app);
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    }
  };
}

export { hydrateApp };
//# sourceMappingURL=client.js.map
