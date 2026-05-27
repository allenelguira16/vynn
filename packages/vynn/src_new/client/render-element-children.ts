import { getSuspenseBoundary } from "@/component/suspense";
import { $effect } from "@/reactivity/effect";
import { flattenArray, toArray } from "@/util/array";
import { isNil } from "@/util/is-nil";

import { getNode } from "./get-node";
import { JSX } from "./jsx-runtime";

export function renderElementChildren(
  parentNode: Node,
  children: JSX.Element,
  baseAnchor: Node | null = null,
) {
  if (!isNil(baseAnchor) && !baseAnchor?.parentNode) return () => {};

  let renderDisposers: (() => void)[] = [];

  for (const child of flattenArray(toArray(children))) {
    let subRenderDisposers: (() => void)[] = [];
    let nodeDisposers: (() => void)[] = [];

    const anchor = document.createComment("anchor");
    parentNode.insertBefore(anchor, baseAnchor);

    let node: Element | null = null;

    const effectDisposer = $effect(() => {
      try {
        subRenderDisposers.map((dispose) => dispose());
        subRenderDisposers = [];

        const resolved = typeof child === "function" ? child() : child;

        // nodeDisposers.push(() => node && runComponentCleanup(node));
        nodeDisposers.push(() => node && node.remove());

        if (isNil(resolved)) {
          if (node) {
            parentNode.removeChild(node);
            node = null;
          }
        } else if (typeof resolved === "function") {
          const dispose = renderElementChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
        } else if (Array.isArray(resolved)) {
          const dispose = renderElementChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
        } else {
          const newNode = getNode<Element>(resolved);
          // if (!node) {
          //   if (!newNode.isConnected) {
          parentNode.insertBefore(newNode, anchor);
          //   } else {
          //     parentNode.insertBefore(anchor, newNode);
          //     if (baseAnchor) parentNode.insertBefore(baseAnchor, newNode);
          //   }
          // } else {
          //   parentNode.replaceChild(newNode, node);
          // }
          node = newNode;
        }
      } catch (error) {
        const handler = getSuspenseBoundary();
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
