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

/**
 * Inserts missing nodes around hydrated nodes without moving nodes that are
 * already in their correct parent.
 */
function insertInitialNodes<E extends Element>(
  element: E,
  nodes: Node[],
  before: Node | null,
): void {
  let previous: Node | null = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.parentNode === element) {
      previous = node;
      continue;
    }

    let anchor: Node | null = null;

    if (previous?.parentNode === element) {
      anchor = previous.nextSibling;
    } else {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].parentNode === element) {
          anchor = nodes[j];
          break;
        }
      }

      if (anchor === null && before?.parentNode === element) {
        anchor = before;
      }
    }

    element.insertBefore(node, anchor);
    previous = node;
  }
}

/**
 * Inserts reactive content into an element.
 *
 * On the server, children are resolved directly and deferred async nodes
 * are preserved in the SSR tree.
 *
 * On the client, children are synchronized reactively.
 */

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