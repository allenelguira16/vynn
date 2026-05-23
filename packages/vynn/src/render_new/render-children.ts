import { getNode } from "~/client/get-node";
import { getSuspenseHandler } from "~/component/suspense";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { $effect } from "~/reactivity/effect";
import { JSX } from "~/types/jsx";
import { createTargetNode } from "~/util/create-target-node";
import { isNil } from "~/util/is-node-nil";
import { toArray } from "~/util/to-array";

export function renderChildren(parentNode: ParentNode, children: JSX.Element) {
  let renderDisposers: (() => void)[] = [];
  // const nodes: (Element | null)[] = [];

  try {
    for (const child of toArray(children)) {
      const anchor = createTargetNode("stable-anchor");
      parentNode.append(anchor);

      let node: Element | null = null;

      const effectDisposer = $effect(() => {
        const resolved = typeof child === "function" ? child() : child;
        if (isNil(resolved)) {
          if (node) {
            node.remove();
            node = null;
          }
          return;
          // continue;
        }

        if (typeof resolved === "function" || Array.isArray(resolved)) {
          const dispose = renderChildren(parentNode, resolved);

          // dispose();
          // subRenderDisposers.push(dispose);
          renderDisposers.push(dispose);
          return;
          // continue;
        }

        if (!node) {
          node = getNode<Element>(resolved);
          parentNode.insertBefore(node, anchor);
        } else {
          const newNode = getNode<Element>(resolved);
          node.replaceWith(newNode);
          node = newNode;
        }
      });

      renderDisposers.push(() => node && runComponentCleanup(node));
      renderDisposers.push(() => node && node.remove());
      renderDisposers.push(() => effectDisposer());
      renderDisposers.push(() => anchor.remove());
    }
  } catch (error) {
    const handler = getSuspenseHandler();
    if (error instanceof Promise && handler) {
      for (const dispose of renderDisposers) dispose();

      handler(error);
    } else {
      throw error;
    }
  }

  return () => {
    for (const dispose of renderDisposers) dispose();

    renderDisposers = [];
  };
}
