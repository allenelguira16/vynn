import { claimHydrationElement } from "../client/hydration";
import { isServer } from "../context/is-server-context";
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
  if (isServer()) {
    return createSSRNode(key) as unknown as HTMLElementTagNameMap[T];
  }

  let element = document.createElement(key);

  element = claimHydrationElement<HTMLElementTagNameMap[T]>() || element;
  // console.log(element, claimHydrationElement<HTMLElementTagNameMap[T]>());

  return element;
}
