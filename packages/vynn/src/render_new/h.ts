import { applyProps } from "~/client/apply-props";
import { FC, PropsWithChildren } from "~/types/props";

import { createElement, xlmnsHandler } from "./create-element";
import { renderChildren } from "./render-children";
import { renderComponent } from "./render-component";

/**
 * create a JSX element
 *
 * @param type - The type of the element.
 * @param props - The properties of the element.
 * @param children - The children of the element.
 * @returns The JSX element.
 */
export function h<T extends PropsWithChildren<Record<string, any>>>(
  type: string | FC<T>,
  props = {} as Omit<T, "children">,
  children?: T["children"],
  _key?: () => string,
) {
  if (typeof type === "function") {
    return renderComponent(type, props, children);
  }

  // console.log(type, getSuspenseHandler());
  if (type === "html") {
    return children?.();
  }

  const handler = xlmnsHandler(props);
  handler.start();

  const element = createElement(type);
  let cleanup: (() => void) | undefined;

  // try {
  // $effect(() => {
  //   cleanup?.();
  cleanup = renderChildren(element, children);
  applyProps(element, props);
  // });
  // } catch (error) {
  //   console.log(error);
  // }
  queueMicrotask(() => {
    if (!element.parentNode) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNodes of mutation.removedNodes) {
          if (element.isSameNode(removedNodes)) {
            cleanup?.();
            // anchor.remove();
            observer.disconnect();
          }
        }
      }
    });

    observer.observe(element.parentNode, { childList: true });
  });

  handler.end();
  return element;
}
