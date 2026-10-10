// import { IS_SERVER_ENV } from "../utils/is-server-env";

import { getRenderMode } from "../utils/render-mode";
import { createSSRNode } from "./resolve-node";
/**
 * Creates a native DOM element for the given HTML tag name.
 *
 * @param key The HTML tag name.
 * @returns The newly created DOM element.
 */
export function $tmpl<T extends keyof HTMLElementTagNameMap>(
  key: T,
): HTMLElementTagNameMap[T] {
  if (getRenderMode()) {
    return createSSRNode(key) as unknown as HTMLElementTagNameMap[T];
  }

  const element = document.createElement(key);

  return element;
}
