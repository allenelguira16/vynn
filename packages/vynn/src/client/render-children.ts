import { getSuspenseHandler } from "~/component/suspense";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { $effect } from "~/reactivity/effect";
import { JSX } from "~/types/jsx";
import { createAnchor } from "~/util/create-target-node";
import { isNil } from "~/util/is-node-nil";
import { flattenArray, toArray } from "~/util/to-array";

import { getNode } from "./get-node";

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
    let subRenderDisposers: (() => void)[] = [];
    let nodeDisposers: (() => void)[] = [];

    const anchor = createAnchor(`anchor-${child}`, true);
    parentNode.insertBefore(anchor, baseAnchor);

    let node: Element | null = null;

    const handler = getSuspenseHandler();
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
              if (baseAnchor) parentNode.insertBefore(baseAnchor, newNode.nextElementSibling);
              parentNode.insertBefore(anchor, newNode.nextElementSibling);
            }
          } else {
            parentNode.replaceChild(newNode, node);
          }
          node = newNode;
        }

        nodeDisposers.push(() => node && runComponentCleanup(node));
        nodeDisposers.push(() => node && node.remove());
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
