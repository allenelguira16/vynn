'use strict';

var jsxRuntime = require('./chunks/portal-DC3Jr9KV.js');
var flatDomContents = require('./chunks/flat-dom-contents-C_R5gAYg.js');

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
      const flatDom = flatDomContents.flattenDOMContents(node);
      const lazyDom = flatDomContents.flattenLazyDOMContents(node);
      jsxRuntime.setLazyDom(lazyDom);
      jsxRuntime.setSsrDomWalker(flatDom.filter((node2) => !jsxRuntime.flattenArray(lazyDom).flat().includes(node2)));
      const app = jsxRuntime.mountComponent(App);
      cleanup = jsxRuntime.renderChildren(node, app);
    },
    unmount: () => {
      if (!cleanup) throw new Error("Can only unmount if the app is mounted");
      cleanup();
    }
  };
}

exports.createApp = jsxRuntime.createApp;
exports.hydrateApp = hydrateApp;
//# sourceMappingURL=client.js.map
