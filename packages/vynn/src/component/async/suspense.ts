import { clientStreamContext, getCurrentStream } from "~/context";
import { JSX } from "~/jsx-runtime";
import { $state } from "~/reactivity";
import { normalizeToString } from "~/render";
import { isServer, isServerStreaming, ssrDomWalker } from "~/util";

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
  const { fallback: _fallback = () => null, children: _children } = props as unknown as {
    fallback?: () => JSX.Element;
    children: () => JSX.Element;
  };

  const children = () => _children();
  const fallback = () => _fallback();

  if (isServerStreaming) return streamingSuspense(fallback, children);

  if (isServer) return fallback?.();

  const view = $state<JSX.Element>(fallback);

  const handler = (promise: Promise<void>) => {
    suspenseHandlerStack.pop();

    queueMicrotask(() => {
      if (fallback) view.value = !("__fromLazy" in promise) ? fallback : () => null;
      // if (fallback) view.value = fallback;
    });

    promise.then(() => {
      withSuspenseRender(children);
    });
  };

  const withSuspenseRender = (newView: () => JSX.Element) => {
    suspenseHandlerStack.push(handler);

    try {
      view.value = newView;
    } catch (error) {
      if (error instanceof Promise) {
        handler(error);
      } else {
        throw error;
      }
    }
  };

  if (!isServer && (window as any).__SSR_STREAMING_APP__) {
    withSuspenseRender(children);
  } else {
    onDoneHydration(() => {
      withSuspenseRender(children);
    });
  }

  return () => view.value;
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

  const stream = getCurrentStream();

  const handler = (promise: Promise<any>) => {
    promise
      .then(() => {
        const html = normalizeToString(children as any);

        const template = `<template async-id="${id}">${html}</template>`;
        const script = `<script>__hydrateAsync("${id}");document.currentScript.remove();</script>`;

        stream.controller.enqueue(stream.encoder.encode(template));
        stream.controller.enqueue(stream.encoder.encode(script));

        stream.end();
        stream.tryClose();
      })
      .catch((err) => {
        if (err instanceof Promise) {
          handler(err);
          return;
        }

        console.error("[vynn]: Suspense promise rejected:", err);

        stream.end();
        stream.tryClose();
      });
  };

  try {
    return normalizeToString(children as any);
  } catch (error) {
    if (error instanceof Promise) {
      stream.start();
      handler(error);
    }

    return [`<!--~$:${id}-->`, fallback?.() ?? "", `<!--/$:${id}-->`];
  }
}
