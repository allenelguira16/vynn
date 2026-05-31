import { jsx as jsxClient } from "~/client/jsx";
import { Fragment } from "~/component/fragment";
import { jsx as jsxServer } from "~/server/jsx";
import { JSX } from "~/types/jsx";
import { FC, PropsWithChildren } from "~/types/props";
import { logJsx } from "~/util/log-jsx";
import { isServer } from "~/util/server-util";

/**
 * jsx runtime
 *
 * @param type - The type of the element.
 * @param props - The properties of the element.
 * @param children - The children of the element.
 * @returns The JSX element.
 */
const jsx = <T extends PropsWithChildren<Record<string, any>>>(
  type: string | FC<T>,
  { children, ...props } = {} as T,
  key: () => string,
) => {
  if (isServer) {
    return jsxServer(type, props, children, key);
  }

  return jsxClient(type, props, children, key);
};

export { Fragment, type JSX, jsx, jsx as jsxs, logJsx };
