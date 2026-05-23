import { FC, PropsWithChildren } from "~/types/props";
import { IS_LOG_JSX } from "~/util/log-jsx";
import { ssrDomWalker } from "~/util/ssr-dom-walker";

import { applyProps } from "./apply-props";
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
  key?: () => string,
) {
  if (typeof type === "function") {
    return renderComponent(type, props, children, key);
  }

  if (type === "html") {
    return children;
  }

  xmlnsStack.push(props.xmlns?.() ?? xmlnsStack[xmlnsStack.length - 1]);

  const element = createElement(type);

  const cleanup = renderChildren(element, children);
  applyProps(element, props);

  queueMicrotask(() => {
    if (!element.parentNode) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNodes of mutation.removedNodes) {
          if (element.isSameNode(removedNodes)) {
            cleanup();
            observer.disconnect();
          }
        }
      }
    });

    observer.observe(element.parentNode, { childList: true });
  });

  xmlnsStack.pop();
  return element;
}

const xmlnsStack: (string | undefined)[] = [];

function createElement(tag: string) {
  const { currentNode, next } = ssrDomWalker();

  if (currentNode instanceof Element && !IS_LOG_JSX) {
    if (currentNode.tagName.toLowerCase() !== tag) {
      console.error(
        "Hydration mismatch because the initial UI does not match what was rendered on the server",
      );
    }

    next();
    return currentNode;
  }

  const currentXmlns = xmlnsStack[xmlnsStack.length - 1];
  return currentXmlns ? document.createElementNS(currentXmlns, tag) : document.createElement(tag);
}
