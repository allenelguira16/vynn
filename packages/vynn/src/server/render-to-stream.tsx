import { AsyncLocalStorage } from "async_hooks";

import { StreamContext } from "~/context";
import { JSX } from "~/jsx-runtime";
import { setIsServerStreaming } from "~/util";

import { h } from "./h";

/**
 * render an application into a streamable pipe.
 *
 * @param App root application
 * @returns stream
 */
export function renderToStream(
  App: () => JSX.Element,
): ReadableStream<Uint8Array<ArrayBufferLike>> {
  setIsServerStreaming(true);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const als = new AsyncLocalStorage<StreamContext>();

      const encoder = new TextEncoder();
      let pending = 0;
      (globalThis as any).__stream_context = {
        encoder,
        controller,
        start: () => pending++,
        end: () => pending--,
        tryClose: () => {
          if (!pending) controller.close();
        },
      } satisfies StreamContext;

      als.run((globalThis as any).__stream_context, () => {
        const store = als.getStore();

        (globalThis as any).__stream_context = store;

        try {
          const html = h(App, {}) as string;
          controller.enqueue(encoder.encode(html));
          (globalThis as any).__stream_context.tryClose();
        } catch (err) {
          // If App throws a Promise (suspense), that promise will be created inside this ALS context
          // so later .then handlers can read getCurrentStream() safely.
          console.error("renderToStream error:", err);
        }
      });
    },
  });

  return stream;
}
