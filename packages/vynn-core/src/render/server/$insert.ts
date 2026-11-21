import type { JSX } from "../../types/jsx";
import { $claimTemplateAnchor } from "./$template";
import { getChildDOMNamespace, withDOMNamespace } from "../namespace";
import { createSSRText, resolveSSRChild, SSR_ELEMENT, SSR_TEXT, type SSR_NODE } from "./resolve-node";

function getSSRTextContent(node: SSR_NODE): string {
  if (node instanceof SSR_TEXT) return node.value;
  if (node instanceof SSR_ELEMENT) {
    return node.children.map(getSSRTextContent).join("");
  }
  return "";
}

export function $insert<E extends Element>(
  element: E,
  child: (() => JSX.Element) | JSX.Element,
  slotId: string,
): Node;
export function $insert<E extends Element>(
  element: E,
  child: (() => JSX.Element) | JSX.Element,
  before?: Node | null,
): void | (() => void);
export function $insert<E extends Element>(
  element: E,
  child: (() => JSX.Element) | JSX.Element,
  before: Node | string | null = null,
): void | (() => void) | Node {


  const parent = element as unknown as SSR_ELEMENT;
  if (parent.innerHTML !== undefined) throw new Error("[vynn]: An element cannot have both the `html` prop and children.");
  const renderChild = typeof child === "function" ? child : () => child;
  const childNamespace = getChildDOMNamespace(parent.namespaceURI, parent.type);
  const nodes = resolveSSRChild(() => withDOMNamespace(childNamespace, renderChild));
  if (parent.type === "title" && typeof before !== "string") {
    const value = nodes.map(getSSRTextContent).join("");
    if (value) parent.appendChild(createSSRText(value));
    return;
  }
  const reference = typeof before === "string" ? ($claimTemplateAnchor(parent, before) as unknown as SSR_NODE) : (before as unknown as SSR_NODE | null);
  for (const node of nodes) parent.insertBefore(node, reference);
  return typeof before === "string" ? (reference as unknown as Node) : undefined;
}