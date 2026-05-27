'use strict';

var logJsx = require('./chunks/BMPDAHvm.js');
var flatDomContents = require('./chunks/ChMd1pbg.js');

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
        const flatDom = flatDomContents.flattenDOMContents(node);
        const lazyDom = flatDomContents.flattenLazyDOMContents(node);
        logJsx.setLazyDom(lazyDom);
        logJsx.setSsrDomWalker(flatDom.filter((node2) => !logJsx.flattenArray(lazyDom).flat().includes(node2)));
        const app = logJsx.renderComponent(App);
        cleanup = logJsx.renderChildren(node, app);
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

exports.createApp = logJsx.createApp;
exports.hydrateApp = hydrateApp;
//# sourceMappingURL=client.js.map
