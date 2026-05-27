import { h } from './chunks/BJBPOMhh.js';
import { AsyncLocalStorage } from 'async_hooks';
import { u as setIsServerStreaming, a as $state, $ as $effect, c as clientStreamContext } from './chunks/CkvSgCt_.js';

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
  return h("script", {
    html: `window.__hydrateAsync = ${hydrateAsync.toString()};window.__SSR_STREAMING_APP__ = true;`
  });
}

function renderToStream(App) {
  setIsServerStreaming(true);
  const stream = new ReadableStream({
    async start(controller) {
      const als = new AsyncLocalStorage();
      const encoder = new TextEncoder();
      const pending = $state(0);
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
          const html = h(App, {});
          controller.enqueue(encoder.encode(html));
        } catch (err) {
          console.error("renderToStream error:", err);
        }
      });
      $effect(() => {
        if (pending.value <= 0) {
          controller.close();
        }
      });
    }
  });
  return stream;
}

function renderToString(App) {
  const memoStore = clientStreamContext().memo;
  memoStore.clear();
  return App();
}

export { HydrateStreamScript, renderToStream, renderToString };
//# sourceMappingURL=server.js.map
