import { claimHydrationElement } from "../client/hydration";
import { isServer } from "../context/is-server-context";
import { createSSRNode } from "./resolve-node";
import {
  getElementNamespace,
  HTML_NAMESPACE,
} from "./namespace";

/**
 * Creates a native DOM element in the active HTML or SVG namespace.
 *
 * The active namespace is supplied by the parent insertion, so SVG elements
 * remain correctly namespaced across nested elements and component calls.
 */
export function $tmpl<T extends keyof SVGElementTagNameMap>(
  key: T,
): SVGElementTagNameMap[T];
export function $tmpl<T extends keyof HTMLElementTagNameMap>(
  key: T,
): HTMLElementTagNameMap[T];
export function $tmpl(key: string): Element;
export function $tmpl(key: string): Element {
  if (isServer()) {
    return createSSRNode(key) as unknown as Element;
  }

  const namespace = getElementNamespace(key);
  const element =
    namespace === HTML_NAMESPACE
      ? document.createElement(key)
      : document.createElementNS(namespace, key);

  return claimHydrationElement<Element>() || element;
}
