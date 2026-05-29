import { clientStreamContext } from "~/context/stream-context";
import { JSX } from "~/types/jsx";
import { memo } from "~/util/memo";
import { isServer, isServerStreaming } from "~/util/server-util";
import { lazyNodes, setSsrDomWalker, ssrDomWalker } from "~/util/ssr-dom-walker";

const MARKER_START = "lazy";
const MARKER_END = "/lazy";

// let isWarned = false;

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
  // if (!isWarned) {
  //   console.warn(`[vynn]: lazy() is still experimental so expect flickers`);
  //   isWarned = true;
  // }

  // const loader = ;
  // if (!loader) loader = ;
  let id: number;
  let component: M[K] | undefined;
  let error: Error | undefined;
  let promise: Promise<void> | null = null;

  const getComponent = (): M[K] | undefined => {
    if (component) {
      try {
        return component;
      } finally {
        component = undefined;
      }
    }
    if (error) throw error;

    promise = _loader()
      .then(async (modules) => {
        if (!(namedExport in modules)) {
          throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
        }

        component = (() => {
          const lazyNode = lazyNodes[id] || [];
          setSsrDomWalker([...ssrDomWalker().renderedNodes, ...lazyNode]);
          lazyNodes[id] = [];
          return modules[namedExport]();
        }) as M[K];
      })
      .catch((err) => {
        error = err instanceof Error ? err : new Error(String(err));
      });

    throw Object.assign(promise, { __fromLazy: !ssrDomWalker().isHydrating });
  };

  return memo(() => {
    id ??= clientStreamContext().lazyID++;
    if (isServer && !isServerStreaming()) {
      throw new Promise(() => {}); // trigger on ssr to show only fallback
    }

    const Component = getComponent()!;
    const resolved = Component();

    if (isServerStreaming()) {
      return () => [
        `<!--${MARKER_START}:${id}-->`,
        resolved instanceof Function ? resolved() : resolved,
        `<!--${MARKER_END}:${id}-->`,
      ];
    }

    return resolved;
  });
};

// function onDoneHydration(fn: () => void) {
//   if (!ssrDomWalker().isHydrating) {
//     fn();
//     return;
//   }

//   requestAnimationFrame(() => onDoneHydration(fn));
// }
