import { $effect } from "../reactivity/$effect";
import { resolveNode } from "./resolve-node";
import { JSX } from "../index";

export function $insert(
  element: Node,
  child: (() => JSX.Element) | string | number,
) {
  let oldNodes: Node[] = [];

  $effect(() => {
    const newNodes = resolveNode(
      typeof child === "function" ? child : () => child,
    );

    const length = Math.min(oldNodes.length, newNodes.length);

    // Replace existing nodes.
    for (let i = 0; i < length; i++) {
      if (oldNodes[i] !== newNodes[i]) {
        element.replaceChild(newNodes[i], oldNodes[i]);
      }
    }

    // Add new nodes.
    for (let i = length; i < newNodes.length; i++) {
      element.appendChild(newNodes[i]);
    }

    // Remove nodes that no longer exist.
    for (let i = newNodes.length; i < oldNodes.length; i++) {
      element.removeChild(oldNodes[i]);
    }

    oldNodes = newNodes;
  });
}
