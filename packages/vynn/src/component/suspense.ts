import { clientStreamContext, getCurrentStream } from "~/context/stream-context";
import { $state } from "~/reactivity/state";
import { normalizeToString } from "~/server/normalize-to-string";
import { JSX } from "~/types/jsx";
import { isServer, isServerStreaming } from "~/util/server-util";
import { ssrDomWalker } from "~/util/ssr-dom-walker";

const suspenseHandlerStack: ((promise: Promise<void>) => void)[] = [];

export function getSuspenseHandler() {
  return suspenseHandlerStack[suspenseHandlerStack.length - 1] as
    | ((promise: Promise<void>) => void)
    | undefined;
}

/**
 * Suspense component for suspending async operations
 *
 * @param props - The props of the component.
 * @returns jsx function
 */
export function Suspense(props: { fallback?: JSX.Element; children: JSX.Element }): JSX.Element {
  const { fallback: fallback = () => null, children: children } = props as unknown as {
    fallback?: () => JSX.Element;
    children: () => JSX.Element;
  };

  // console.log("fallback", props.fallback);
  // console.log("children", props.children);
  if (isServerStreaming()) return streamingSuspense(fallback, children);
  if (isServer) return fallback?.();

  const view = $state<() => JSX.Element>(fallback);

  function handler(promise: Promise<void>) {
    // queueMicrotask(() => {
    suspenseHandlerStack.pop();
    // });

    // queueMicrotask(() => {
    //   // if (fallback) view.value = fallback;
    // });
    view.value = !("__fromLazy" in promise) ? fallback : () => null;

    promise.then(() => {
      view.value = children;
    });
  }

  if (!isServer && (window as any).__SSR_STREAMING_APP__) {
    view.value = children;
  } else {
    onDoneHydration(() => {
      view.value = children;
    });
  }

  return () => {
    suspenseHandlerStack.push(handler);
    // return () => {
    return view.value;
    // };
  };
}

function onDoneHydration(fn: () => void) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }

  requestAnimationFrame(() => onDoneHydration(fn));
}

function streamingSuspense(fallback: () => JSX.Element, children: () => JSX.Element) {
  const context = clientStreamContext();
  const id = context.suspenseID++;

  const { controller, encoder, end: endIfDone, start } = getCurrentStream();

  const handler = (promise: Promise<any>) => {
    promise
      .then(() => {
        const html = normalizeToString(children);

        console.log("natawag");
        const template = `<template async-id="${id}">${html}</template>`;
        const script = `<script>__hydrateAsync("${id}");document.currentScript.remove();</script>`;

        controller.enqueue(encoder.encode(template));
        controller.enqueue(encoder.encode(script));

        endIfDone();
      })
      .catch((err) => {
        if (err instanceof Promise) {
          start();
          handler(err);
          return;
        }

        console.error("[vynn]: Suspense promise rejected:", err);

        endIfDone();
      });
  };

  try {
    return normalizeToString(children);
  } catch (error) {
    if (error instanceof Promise) {
      start();
      handler(error);
    }

    return [`<!--~$:${id}-->`, fallback?.() ?? "", `<!--/$:${id}-->`];
  }
}
