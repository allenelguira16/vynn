import { AsyncLocalStorage } from "async_hooks";

import { StreamContext } from "~/context/stream-context";
import { $effect } from "~/reactivity/effect";
import { $state } from "~/reactivity/state";
import { JSX } from "~/types/jsx";
import { setIsServerStreaming } from "~/util/server-util";

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
    async start(controller) {
      const als = new AsyncLocalStorage<StreamContext>();
      const encoder = new TextEncoder();
      const pending = $state(0);
      // let pending = 0;
      globalThis.__stream_context = {
        encoder,
        controller,
        start: () => pending.value++,
        end: () => {
          pending.value--;
        },
      } satisfies StreamContext;

      als.run(globalThis.__stream_context, () => {
        const store = als.getStore()!;
        globalThis.__stream_context = store;

        try {
          const html = h(App, {});
          // console.log(html);
          controller.enqueue(encoder.encode(html));

          // queueMicrotask(() => );

          // console.log();
          // globalThis.__stream_context.endIfDone();
        } catch (err) {
          // If App throws a Promise (suspense), that promise will be created inside this ALS context
          // so later .then handlers can read getCurrentStream() safely.
          console.error("renderToStream error:", err);
        }
      });

      $effect(() => {
        if (pending.value <= 0) {
          controller.close();
        }
      });
    },
  });

  return stream;
}
