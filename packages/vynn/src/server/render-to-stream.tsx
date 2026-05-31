import { AsyncLocalStorage } from "async_hooks";

import { resetRuntimeContext } from "~/context/runtime-context";
import { StreamContext } from "~/context/stream-context";
import { runOwnerCleanups } from "~/lifecycle/owner";
// import { resetClientStreamContext, StreamContext } from "~/context/stream-context";
import { JSX } from "~/types/jsx";
import { setisServerStreaming } from "~/util/server-util";

import { normalizeToString } from "./normalize-to-string";

/**
 * render an application into a streamable pipe.
 *
 * @param App root application
 * @returns stream
 */
export function renderToStream(App: () => JSX.Element) {
  setisServerStreaming(true);
  // globalThis.__stream_context = undefined;
  resetRuntimeContext();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const als = new AsyncLocalStorage<StreamContext>();
      const encoder = new TextEncoder();
      globalThis.__stream_context = {
        encoder,
        controller,
        promises: [],
      } satisfies StreamContext;

      als.run(globalThis.__stream_context, () => {
        const store = als.getStore()!;
        globalThis.__stream_context = store;

        try {
          const html = normalizeToString(App()) || "";

          controller.enqueue(encoder.encode(html));

          endStream(() => {
            runOwnerCleanups();
            controller.close();
          });
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

function endStream(cb: () => void) {
  queueMicrotask(async () => {
    await globalThis.__stream_context.promises.pop();

    if (globalThis.__stream_context.promises.length) {
      endStream(cb);
    } else {
      cb();
    }
  });
}
