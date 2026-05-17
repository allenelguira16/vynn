import { createApp } from "~/client";
import { JSX } from "~/jsx-runtime";
import { rootNodes } from "~/render/mount-component/mount-component";

import { isServer } from "./server-util";

export let IS_LOG_JSX = false;

/**
 * log the JSX elements
 *
 * @param nodes - The nodes to log.
 * @returns The nodes that are not text nodes and are not in the componentRootNodes set.
 */
export function logJsx(nodes: JSX.Element) {
  try {
    IS_LOG_JSX = true;

    if (isServer) return nodes;

    const fragment = document.createDocumentFragment();
    createApp(() => nodes).mount(fragment);

    const newNodes = [...Array.from(fragment.childNodes).filter((node) => !rootNodes.has(node))];

    return newNodes.length === 1 ? newNodes[0] : newNodes;
  } finally {
    IS_LOG_JSX = false;
  }
}
