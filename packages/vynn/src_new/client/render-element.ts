import { PropsWithChildren } from "@/types/props";

import { renderElementChildren } from "./render-element-children";
import { renderElementProps } from "./render-element-props";

export function renderElement<T extends PropsWithChildren<Record<string, any>>>(
  nodeName: keyof HTMLElementTagNameMap,
  props?: Omit<T, "children">,
  children?: T["children"],
) {
  const node = document.createElement(nodeName);

  // const child = memoize(() => children?.());
  const cleanups: (() => void)[] = [];
  // try {
  cleanups.push(renderElementProps(node, props as Record<string, any>));
  cleanups.push(renderElementChildren(node, children));
  // } catch (error) {
  //   if (error instanceof Promise) {
  //     const boundary = getSuspenseBoundary();
  //     // console.log(boundary());
  //     console.log(renderElementChildren(node, boundary()));
  //   }
  // }

  return node;
}
