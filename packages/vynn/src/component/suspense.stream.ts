import { clientStreamContext, getCurrentStream } from "~/context/stream-context";
import { normalizeToString } from "~/server/normalize-to-string";
import { JSX } from "~/types/jsx";

type SuspenseStreamProps = {
  fallback?: () => JSX.Element;
  children: () => JSX.Element;
};

export function SuspenseStream({ children, fallback = () => null }: SuspenseStreamProps) {
  const context = clientStreamContext();
  const id = context.suspenseID++;

  const { controller, encoder, end: endIfDone, start } = getCurrentStream();

  const handler = (promise: Promise<any>) => {
    start();
    promise
      .then(() => {
        const html = normalizeToString(children);

        const template = `<template async-id="${id}">${html}</template>`;
        const script = `<script>__hydrateAsync("${id}");document.currentScript.remove();</script>`;

        controller.enqueue(encoder.encode(template));
        controller.enqueue(encoder.encode(script));
      })
      .catch((err) => {
        if (err instanceof Promise) {
          start();
          handler(err);
        } else {
          throw err;
        }
      })
      .finally(() => endIfDone());
  };

  try {
    return normalizeToString(children);
  } catch (error) {
    if (error instanceof Promise) {
      handler(error);
    }

    return [`<!--~$:${id}-->`, fallback?.() ?? "", `<!--/$:${id}-->`];
  }
}
