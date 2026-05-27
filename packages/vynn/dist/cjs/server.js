'use strict';

var h = require('./chunks/DOPi4EeN.js');
var async_hooks = require('async_hooks');
var logJsx = require('./chunks/BMPDAHvm.js');

function HydrateStreamScript() {
  function hydrateAsync(id) {
    const tpl = document.querySelector(`[async-id="${id}"]`);
    if (!tpl) return;
    const html = tpl.content.cloneNode(true);
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    let start = null;
    let end = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue === `~$:${id}`) start = node;
      if (node.nodeValue === `/$:${id}`) end = node;
    }
    if (start && end) {
      const range = document.createRange();
      range.setStartAfter(start);
      range.setEndBefore(end);
      range.deleteContents();
      range.insertNode(html);
      start.remove();
      end.remove();
    }
    tpl.remove();
  }
  return h.h("script", {
    html: `window.__hydrateAsync = ${hydrateAsync.toString()};window.__SSR_STREAMING_APP__ = true;`
  });
}

function renderToStream(App) {
  logJsx.setIsServerStreaming(true);
  const stream = new ReadableStream({
    async start(controller) {
      const als = new async_hooks.AsyncLocalStorage();
      const encoder = new TextEncoder();
      const pending = logJsx.$state(0);
      globalThis.__stream_context = {
        encoder,
        controller,
        start: () => pending.value++,
        end: () => {
          pending.value--;
        }
      };
      als.run(globalThis.__stream_context, () => {
        const store = als.getStore();
        globalThis.__stream_context = store;
        try {
          const html = h.h(App, {});
          controller.enqueue(encoder.encode(html));
        } catch (err) {
          console.error("renderToStream error:", err);
        }
      });
      logJsx.$effect(() => {
        if (pending.value <= 0) {
          controller.close();
        }
      });
    }
  });
  return stream;
}

function renderToString(App) {
  const memoStore = logJsx.clientStreamContext().memo;
  memoStore.clear();
  return App();
}

exports.HydrateStreamScript = HydrateStreamScript;
exports.renderToStream = renderToStream;
exports.renderToString = renderToString;
//# sourceMappingURL=server.js.map
