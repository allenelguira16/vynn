import { getNodeString } from "~/render/server/get-node-string";
import { isNil } from "~/util/is-node-nil";
import { toArray } from "~/util/to-array";

import { JSX } from "./jsx-runtime";

const skipWrappingTags = new Set(["title", "meta", "script", "style"]);

/**
 * Handle the children of the element for SSR
 *
 * @param children - The children of the element.
 * @returns The transformed children.
 */
export function renderChildren(parent: string, children: JSX.Element) {
  function renderRecursive(value: JSX.Element) {
    const transformedChildren: string[] = [];

    const resolvedChildren = value instanceof Function ? value() : value;
    const children = toArray(resolvedChildren);

    for (const child of children) {
      if (isNil(child)) continue;

      if (typeof child === "function") {
        const resolved = renderRecursive(child);
        if (!isNil(resolved)) transformedChildren.push(resolved);
      } else {
        const resolved = getNodeString(child, skipWrappingTags.has(parent));
        if (!isNil(resolved)) transformedChildren.push(resolved);
      }
    }

    return transformedChildren.join("") || null;
  }

  return renderRecursive(children);
}
