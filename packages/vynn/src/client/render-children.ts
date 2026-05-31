import { getSuspenseHandler } from "~/component/suspense";
import { getContext } from "~/lifecycle/owner";
import { $effect } from "~/reactivity/effect";
import { JSX } from "~/types/jsx";
import { createAnchor } from "~/util/create-anchor";
import { isNil } from "~/util/is-nil";
import { flattenArray, toArray } from "~/util/to-array";

import { getNode } from "./get-node";
import { rootNodes } from "./render-component";

/**
 * Render children of jsx
 *
 * @returns cleanup
 */
export function renderChildren(
  parentNode: Node,
  children: JSX.Element,
  baseAnchor: Node | null = null,
) {
  if (!isNil(baseAnchor) && !baseAnchor?.parentNode) return () => {};

  let renderDisposers: (() => void)[] = [];

  for (const child of flattenArray(toArray(children))) {
    let nodeDisposers: (() => void)[] = [];
    let subRenderDisposers: (() => void)[] = [];

    const anchor = createAnchor(`anchor-${child}`, true);
    parentNode.insertBefore(anchor, baseAnchor);

    let node: Element | null = null;

    const handler = getSuspenseHandler();
    // let isRetrying = false;
    const effectDisposer = $effect(() => {
      try {
        subRenderDisposers.map((dispose) => dispose());
        subRenderDisposers = [];

        const resolved = typeof child === "function" ? child() : child;

        if (isNil(resolved)) {
          if (node) {
            parentNode.removeChild(node);
            node = null;
          }
        } else if (typeof resolved === "function") {
          const dispose = renderChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
        } else if (Array.isArray(resolved)) {
          const dispose = renderChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
        } else {
          const newNode = getNode<Element>(resolved);
          if (!node) {
            if (!newNode.isConnected) {
              parentNode.insertBefore(newNode, anchor);
            } else {
              if (baseAnchor) parentNode.insertBefore(baseAnchor, newNode.nextSibling);
              parentNode.insertBefore(anchor, newNode.nextSibling);
            }
          } else {
            parentNode.replaceChild(newNode, node);
          }
          node = newNode;
        }

        renderDisposers.push(() => {
          if (node) {
            if (getContext<boolean>("is-suspending") && rootNodes.has(node)) {
              return;
            }
            node.remove();
          }
        });
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      }
    });

    const cleanup = () => {
      for (const dispose of subRenderDisposers) dispose();
      for (const dispose of nodeDisposers) dispose();

      subRenderDisposers = [];
      nodeDisposers = [];
      effectDisposer();
      anchor.remove();
    };

    renderDisposers.push(cleanup);
  }

  return () => {
    for (const dispose of renderDisposers) {
      dispose();
    }

    renderDisposers = [];
  };
}
