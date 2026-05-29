import { h } from "~/client/h";
import { Fragment } from "~/component/fragment";
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
) => {
  if (isServer) {
    return hSSR(type, props, children);
  }

  return h(type, props, children);
};

export { Fragment, type JSX, jsx, jsx as jsxs, logJsx };
