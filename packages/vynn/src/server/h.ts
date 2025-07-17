import { setRuntimeContext } from "~/context";
import { createLifeCycleContext } from "~/lifecycle";
import { normalizeToString, stringifyProps } from "~/render";
import { resolveComponentProps } from "~/render/mount-component/resolve-component-props";
import { FC, PropsWithChildren } from "~/types";

import { renderChildren } from "./render-children";

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
export function h<T extends PropsWithChildren<Record<string, any>>>(
  type: string | FC<T>,
  props = {} as Omit<T, "children">,
  children?: T["children"],
  _key?: () => string,
) {
  if (typeof type === "function") {
    resolveComponentProps(type, props);

    const key = _key ? _key().toString() + type.toString() : undefined;
    const context = createLifeCycleContext(key);

    setRuntimeContext(context);

    try {
      const resolved = normalizeToString(type({ ...props, children } as PropsWithChildren<T>));
      return resolved || undefined;
    } finally {
      setRuntimeContext(null);

      context.destroy.forEach((cleanup) => cleanup());
    }
  }

  if (voidElements.has(type)) {
    return `<${type}${stringifyProps(props)}>`;
  }

  const resolved = renderChildren(type, "html" in props ? props["html"] : children) || "";
  return `<${type}${stringifyProps(props)}>${resolved}</${type}>`;
}
