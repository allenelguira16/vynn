import { getRuntimeContext } from "~/context/runtime-context";
import { getStream } from "~/context/stream-context";
import { normalizeToString } from "~/server/normalize-to-string";
import { JSX } from "~/types/jsx";

type SuspenseStreamProps = {
  fallback?: () => JSX.Element;
  children: () => JSX.Element;
};

export function SuspenseStream({ children, fallback = () => null }: SuspenseStreamProps) {
  const id = getRuntimeContext().suspenseID++;

  const stream = getStream();

  const handler = (promise: Promise<any>) => {
    stream.promises.push(promise);
    promise
      .then(() => {
        const html = normalizeToString(children);

        const template = `<template async-id="${id}">${html}</template>`;
        const script = `<script>__hydrateAsync("${id}");document.currentScript.remove();</script>`;

        stream.controller.enqueue(stream.encoder.encode(template));
        stream.controller.enqueue(stream.encoder.encode(script));

        // endIfDone();
      })
      .catch((err) => {
        if (err instanceof Promise) {
          // endIfDone();
          handler(err);
        } else {
          throw err;
        }
      });
    // .finally(endIfDone);
  };

  try {
    return normalizeToString(children);
  } catch (error) {
    if (error instanceof Promise) {
      // start();
      handler(error);
    }

    return [`<!--~$:${id}-->`, normalizeToString(fallback), `<!--/$:${id}-->`];
  }
}
