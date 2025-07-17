'use strict';

var server_jsxRuntime = require('./chunks/jsx-runtime-C-6-WR-s.js');
var async_hooks = require('async_hooks');
var jsxRuntime = require('./chunks/portal-DC3Jr9KV.js');

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
  return server_jsxRuntime.jsx("script", {
    html: `window.__hydrateAsync = ${hydrateAsync.toString()};window.__SSR_STREAMING_APP__ = true;`
  });
}

function renderToStream(App) {
  jsxRuntime.setIsServerStreaming(true);
  const stream = new ReadableStream({
    start(controller) {
      const als = new async_hooks.AsyncLocalStorage();
      const encoder = new TextEncoder();
      let pending = 0;
      globalThis.__stream_context = {
        encoder,
        controller,
        start: () => pending++,
        end: () => pending--,
        tryClose: () => {
          if (!pending) controller.close();
        }
      };
      als.run(globalThis.__stream_context, () => {
        const store = als.getStore();
        globalThis.__stream_context = store;
        try {
          const html = server_jsxRuntime.h(App, {});
          controller.enqueue(encoder.encode(html));
          globalThis.__stream_context.tryClose();
        } catch (err) {
          console.error("renderToStream error:", err);
        }
      });
    }
  });
  return stream;
}

function renderToString(App) {
  return App();
}

exports.h = server_jsxRuntime.h;
exports.HydrateStreamScript = HydrateStreamScript;
exports.renderToStream = renderToStream;
exports.renderToString = renderToString;
//# sourceMappingURL=server.js.map
