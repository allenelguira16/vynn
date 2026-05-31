import { getRuntimeContext } from "~/context/runtime-context";
import { JSX } from "~/types/jsx";
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

    // throw promise;
    if (!isServerStreaming() && ssrDomWalker().isHydrating) {
      // console.log("hala nag throw rin?");
      throw Object.assign(promise, { __fromLazy: true });
    } else {
      throw promise;
    }
  };

  return () => {
    id ??= getRuntimeContext().lazyID++;
    if (isServer && !isServerStreaming()) {
      throw new Promise(() => {}); // trigger on ssr to show only fallback
    }

    const Component = getComponent()!;
    const resolved = Component();

    if (isServerStreaming()) {
      // console.log("lazy-id: " + id, _loader.toString());

      return () => [
        `<!--${MARKER_START}:${id}-->`,
        resolved instanceof Function ? resolved() : resolved,
        `<!--${MARKER_END}:${id}-->`,
      ];
    }

    return resolved;
  };
};

// function onDoneHydration(fn: () => void) {
//   if (!ssrDomWalker().isHydrating) {
//     fn();
//     return;
//   }

//   requestAnimationFrame(() => onDoneHydration(fn));
// }
