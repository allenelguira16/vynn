import { clientStreamContext } from "~/context/stream-context";
import { JSX } from "~/types/jsx";
import { IS_LOG_JSX } from "~/util/log-jsx";
import { memo } from "~/util/memo";
import { isServerStreaming } from "~/util/server-util";
import { lazyNodes, setSsrDomWalker, ssrDomWalker } from "~/util/ssr-dom-walker";

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
  // const id = clientStreamContext().lazyID++;

  // const componentResource = resource(
  //   async () => {
  //     const module = await _loader();

  //     queueMicrotask(() => {
  //       onDoneHydration(() => {});
  //     });

  //     // console.log(lazyNodes, module[namedExport]);

  //     return module[namedExport];
  //   },
  //   [],
  //   false,
  // );

  // return memo(() => {
  //   if (
  //     !isServerStreaming() &&
  //     ssrDomWalker().isHydrating &&
  //     (window as any).__SSR_STREAMING_APP__ &&
  //     !IS_LOG_JSX
  //   ) {
  //     const ssrDom = lazyNodes[id];
  //     setSsrDomWalker([
  //       ...ssrDomWalker().renderedNodes.filter(
  //         (node) => !flattenArray(ssrDom).flat().includes(node),
  //       ),
  //     ]);
  //   }

  //   if (!isServerStreaming()) {
  //     return () => h(componentResource.data);
  //   }

  //   return () => [
  //     `<!--${MARKER_START}:${id}-->`,
  //     componentResource.data(),
  //     `<!--${MARKER_END}:${id}-->`,
  //   ];
  // });
  console.log("lazy called");
  if (!isWarned) {
    console.warn(`[vynn]: lazy() is still experimental so expect flickers`);
    isWarned = true;
  }

  const loader = _loader();

  const id = clientStreamContext().lazyID++;
  let component: M[K] | undefined;
  let error: Error | undefined;
  let promise: Promise<void> | null = null;

  const getComponent = (): M[K] | undefined => {
    if (component) return component;
    if (error) throw error;

    if (
      !isServerStreaming() &&
      ssrDomWalker().isHydrating &&
      (window as any).__SSR_STREAMING_APP__ &&
      !IS_LOG_JSX
    ) {
      onDoneHydration(() => {
        console.log("hi");
      });

      const lazyNode = lazyNodes[id];

      // console.log(ssrDomWalker().renderedNodes, lazyNode);

      setSsrDomWalker([...new Set([...ssrDomWalker().renderedNodes, ...lazyNode])]);
      // setSsrDomWalker([
      //   ...ssrDomWalker().renderedNodes.filter(
      //     (node) => !flattenArray(lazyNode).flat().includes(node),
      //   ),
      // ]);

      // const view = $state<() => M[K]>((() => {}) as M[K]);

      promise = loader.then((modules) => {
        if (!(namedExport in modules)) {
          throw new Error(`lazy(): Export "${String(namedExport)}" not found in module`);
        }

        component = modules[namedExport] as M[K];
        // const template = document.createElement("div");

        // const app = mountComponent(component as FC);
        // renderChildren(template, app);

        // console.log([...template.childNodes]);
        // setTimeout(() => {
        // const flatten = flattenDOMContents(template);
        // console.log(flatten);
        // const matches = [];

        // function normalize(el: Node) {
        //   return el.outerHTML?.replace(/\s+/g, " ")?.trim();
        // }

        // for (let i = 0; i < lazyNode.length; i++) {
        //   for (let j = 0; j < flatten.length; j++) {
        //     const a = lazyNode[i];
        //     const b = flatten[j];

        //     if (a && b && normalize(a) === normalize(removeComments(b))) {
        //       // matches.push(a);
        //       a.replaceWith(b);
        //     }
        //   }
        // }

        // console.log(matches);

        // lazyNode.forEach((node) => {
        //   console.log(node);
        // });
        // console.log(normalize(lazyNode[0]) === normalize(removeComments(flatten[0])), template);
        // }, 5000);
        // queueMicrotask(() => {});
        // document.body.appendChild(template);

        // console.log(s);
        // console.log();
      });

      throw Object.assign(promise, { __fromLazy: true });
      // return (() => {}) as M[K];
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
  };

  return memo(() => {
    const Component = getComponent()!;
    const resolved = Component();

    if (isServerStreaming()) {
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

function onDoneHydration(fn: () => void) {
  if (!ssrDomWalker().isHydrating) {
    fn();
    return;
  }

  requestAnimationFrame(() => onDoneHydration(fn));
}

function removeComments(node: Node) {
  const clone = node.cloneNode(true);

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT, null);

  const toRemove = [];

  let current;
  while ((current = walker.nextNode())) {
    toRemove.push(current);
  }

  for (const n of toRemove) {
    (n as Element).remove();
  }

  return clone;
}
