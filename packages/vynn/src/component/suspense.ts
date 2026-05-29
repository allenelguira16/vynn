import { clientStreamContext } from "~/context/stream-context";
import { $state } from "~/reactivity/state";
import { JSX } from "~/types/jsx";
import { isServer, isServerStreaming } from "~/util/server-util";
import { ssrDomWalker } from "~/util/ssr-dom-walker";

import { SuspenseSSR } from "./suspense.ssr";
import { SuspenseStream } from "./suspense.stream";

const suspenseHandlerStack: ((promise: Promise<void>) => void)[] = [];
const suspenseSSRHandlerStack: (() => JSX.Element)[] = [];

export function getSuspenseHandler() {
  return suspenseHandlerStack[suspenseHandlerStack.length - 1] as
    | ((promise: Promise<void>) => void)
    | undefined;
}

export function getSuspenseSSRHandler() {
  return suspenseSSRHandlerStack[suspenseSSRHandlerStack.length - 1] as
    | (() => JSX.Element)
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

  if (isServerStreaming()) return SuspenseStream({ fallback, children });
  if (isServer) return SuspenseSSR({ fallback, children });

  (window as any).__SUSPENSE_DEFAULT_FALLBACK__ ??= [];
  const context = clientStreamContext();
  const id = context.suspenseID++;

  const isDefaultFallback = !!(window as any).__SUSPENSE_DEFAULT_FALLBACK__[id];

  const view = $state<() => JSX.Element>(isDefaultFallback ? fallback : children);

  function clientHandler(promise: Promise<void>) {
    suspenseHandlerStack.pop();

    queueMicrotask(() => {
      view.value = !("__fromLazy" in promise) ? fallback : () => null;
    });

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
    suspenseHandlerStack.push(clientHandler);
    return view.value;
  };
}

function onDoneHydration(fn: () => void) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }

  requestAnimationFrame(() => onDoneHydration(fn));
}
