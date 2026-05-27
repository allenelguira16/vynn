import { v as setLazyDom, x as setSsrDomWalker, f as flattenArray, s as renderComponent, r as renderChildren } from './chunks/CkvSgCt_.js';
export { b as createApp } from './chunks/CkvSgCt_.js';
import { f as flattenDOMContents, a as flattenLazyDOMContents } from './chunks/D-0znp9a.js';

function hydrateApp(App) {
  let cleanup;
  return {
    mount: (id) => {
      const start = performance.now();
      try {
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
        const app = renderComponent(App);
        cleanup = renderChildren(node, app);
      } finally {
        requestAnimationFrame(() => {
          const duration = (performance.now() - start) / 1e3;
          console.log("after paint:", duration);
        });
        requestIdleCallback(() => {
          const duration = (performance.now() - start) / 1e3;
          console.log("idle after hydration:", duration);
        });
      }
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    }
  };
}

export { hydrateApp };
//# sourceMappingURL=client.js.map
