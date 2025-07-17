import { clientStreamContext } from "~/context";
import { JSX } from "~/types";
import {
  IS_LOG_JSX,
  isServerStreaming,
  lazyNodes,
  memo,
  setSsrDomWalker,
  ssrDomWalker,
} from "~/util";

const MARKER_START = "lazy";
const MARKER_END = "/lazy";

let isWarned = false;

/**
 * Lazily load components
 *
 * @param loader lazy loader import
 * @param namedExport name of the exported
 * @returns jsx
 */
export const lazy = <M extends Record<string, any>, K extends keyof M = "default">(
  _loader: () => Promise<M>,
  namedExport = "default" as K,
): (() => JSX.Element) => {
  if (!isWarned) {
    console.warn(`[vynn]: lazy() is still experimental so expect flickers`);
    isWarned = true;
  }

  const loader = _loader();

  const id = clientStreamContext().lazyID++;
  let component: M[K] | undefined;
  let error: Error | undefined;
  let promise: Promise<void> | null = null;

  const getComponent = memo((): M[K] | undefined => {
    if (component) return component;
    if (error) throw error;

    if (
      !isServerStreaming &&
      ssrDomWalker().isHydrating &&
      (window as any).__SSR_STREAMING_APP__ &&
      !IS_LOG_JSX
    ) {
      const ssrDom = lazyNodes[id];

      setSsrDomWalker([...ssrDomWalker().renderedNodes, ...ssrDom]);

      promise = loader.then((modules) => {
        if (!(namedExport in modules)) {
          throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
        }

        component = modules[namedExport] as M[K];
      });
      throw Object.assign(promise, { __fromLazy: true });
    }

    if (!promise) {
      promise = loader
        .then((modules) => {
          if (!(namedExport in modules)) {
            throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
          }

          component = modules[namedExport];
        })
        .catch((err) => {
          error = err instanceof Error ? err : new Error(String(err));
        });
    }

    throw promise;
  });

  return memo(() => {
    const Component = getComponent()!;
    const resolved = Component();

    if (isServerStreaming) {
      return () => [
        `<!--${MARKER_START}:${id}-->`,
        resolved instanceof Function ? resolved() : resolved,
        `<!--${MARKER_END}:${id}-->`,
      ];
    }

    (globalThis as any).__lazy++;
    return resolved;
  });
};
