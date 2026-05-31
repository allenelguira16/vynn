import { stringifyProps } from "~/server/stringify-props";
import { FC, PropsWithChildren } from "~/types/props";

import { renderChildren } from "./render-children";
import { renderComponent } from "./render-component";

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Create a JSX element for SSR
 *
 * @param type - The type of the element.
 * @param props - The properties of the element.
 * @param children - The children of the element.
 * @returns The JSX element for SSR.
 */
export function jsx<T extends PropsWithChildren<Record<string, any>>>(
  type: string | FC<T>,
  props = {} as Omit<T, "children">,
  children?: T["children"],
  key?: () => string,
) {
  if (typeof type === "function") {
    return renderComponent(type, { ...props, key }, children);
  }

  if (voidElements.has(type)) {
    return `<${type}${stringifyProps(props)}>`;
  }

  const resolved = renderChildren(type, "html" in props ? props["html"] : children) || "";
  return `<${type}${stringifyProps(props)}>${resolved}</${type}>`;
}
