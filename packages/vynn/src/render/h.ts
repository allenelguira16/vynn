import { FC, PropsWithChildren } from "~/types";
import { IS_LOG_JSX, ssrDomWalker } from "~/util";

import { applyProps, renderChildren } from "./dom";
import { mountComponent } from "./mount-component";

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
    return mountComponent(type, props, children, key);
  }

  if (type === "html") {
    return children;
  }

  xmlnsStack.push(props.xmlns?.() ?? xmlnsStack[xmlnsStack.length - 1]);

  const element = createElement(type);

  renderChildren(element, children);
  applyProps(element, props);

  xmlnsStack.pop();
  return element;
}

const xmlnsStack: (string | undefined)[] = [];

function createElement(tag: string) {
  const { currentNode, next } = ssrDomWalker();

  if (currentNode instanceof Element && !IS_LOG_JSX) {
    console.log(currentNode, tag);
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
