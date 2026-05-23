import { Fragment } from "~/component/fragment";
import { h } from "~/client/h";
import { JSX } from "~/types/jsx";
import { FC, PropsWithChildren } from "~/types/props";
import { logJsx } from "~/util/log-jsx";
import { isServer } from "~/util/server-util";

import { h as hSSR } from "./h";

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
  key?: () => string,
) => {
  if (isServer) {
    return hSSR(type, props, children, key);
  }

  return h(type, props, children, key);
};

export { Fragment, type JSX, jsx, jsx as jsxs, logJsx };
