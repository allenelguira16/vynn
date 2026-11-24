import type { JSX } from "../jsx-runtime";

import { isHydrating } from "../client/hydration-runtime";
import { $claimTemplateAnchor } from "./$template";
import { withHeadElementCreation } from "./head-element-context";

import { $renderEffect } from "../reactivity/effect";
import { hasRawHTMLContent } from "./$attr";
import { getChildDOMNamespace, withDOMNamespace } from "./namespace";
import {
  createSSRText,
  resolveNode,
  resolveSSRChild,
  SSR_ELEMENT,
  SSR_TEXT,
  type SSR_NODE,
} from "./resolve-node";

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

  if (import.meta.env.SSR) {
    const parent = element as unknown as SSR_ELEMENT;

    if (parent.innerHTML !== undefined) {
      throw new Error("[vynn]: An element cannot have both the `html` prop and children.");
    }

    const renderChild = typeof child === "function" ? child : () => child;

    const childNamespace = getChildDOMNamespace(parent.namespaceURI, parent.type);
    const nodes = resolveSSRChild(() => withDOMNamespace(childNamespace, renderChild));

    // A title is RCDATA: comment anchors are serialized as visible text there.
    // Dynamic title content is therefore compiled as one complete text value.
    if (parent.type === "title" && typeof before !== "string") {
      const value = nodes.map(getSSRTextContent).join("");
      if (value) parent.appendChild(createSSRText(value));
      return;
    }

    const reference =
      typeof before === "string"
        ? ($claimTemplateAnchor(parent, before) as unknown as SSR_NODE)
        : (before as unknown as SSR_NODE | null);

    for (const node of nodes) {
      parent.insertBefore(node, reference);
    }

    return typeof before === "string" ? (reference as unknown as Node) : undefined;
  }

  if (hasRawHTMLContent(element)) {
    throw new Error("[vynn]: An element cannot have both the `html` prop and children.");
  }

  const slotStartAnchor =
    typeof before === "string" && element.localName === "title"
      ? ($claimTemplateAnchor(element, "start-" + before) as Node)
      : null;
  const slotAnchor =
    typeof before === "string"
      ? ($claimTemplateAnchor(element, before) as Node)
      : before;
  let oldNodes: Node[] = [];

  const dispose = $renderEffect(() => {
    // Capture this before resolving children, since resolution claims the SSR
    // nodes and can make the hydration queues appear empty.
    const initialHydration = oldNodes.length === 0 && isHydrating();
    const childNamespace = getChildDOMNamespace(element.namespaceURI, element.localName);
    const renderChild = typeof child === "function" ? child : () => child;
    const resolveChildren = () =>
      resolveNode(renderChild, element.localName !== "title");
    const newNodes = withDOMNamespace(childNamespace, () =>
      element.localName === "title"
        ? withHeadElementCreation(resolveChildren)
        : resolveChildren(),
    );

    if (element.localName === "title") {
      // Keep the complete title as one text node. HTML parses <title> as
      // RCDATA, so compiler comment markers would become visible characters.
      const initialTitleNodes: Node[] = [];

      if (initialHydration) {
        if (
          slotStartAnchor?.parentNode === element &&
          slotAnchor?.parentNode === element
        ) {
          let current = slotStartAnchor.nextSibling;
          while (current && current !== slotAnchor) {
            initialTitleNodes.push(current);
            current = current.nextSibling;
          }
        } else {
          initialTitleNodes.push(...Array.from(element.childNodes));
        }
      }

      const textValue = newNodes.map((node) => node.textContent ?? "").join("");
      const existingText =
        oldNodes.find((node): node is Text => node.nodeType === Node.TEXT_NODE) ??
        initialTitleNodes.find((node): node is Text => node.nodeType === Node.TEXT_NODE);
      const retained: Node[] = [];

      if (textValue.length > 0) {
        const text = existingText ?? document.createTextNode(textValue);
        text.data = textValue;

        if (text.parentNode !== element) {
          element.insertBefore(
            text,
            slotAnchor?.parentNode === element ? slotAnchor : null,
          );
        }

        retained.push(text);
      }

      const retainedSet = new Set(retained);
      for (const node of [...oldNodes, ...initialTitleNodes]) {
        if (!retainedSet.has(node) && node.parentNode === element) {
          element.removeChild(node);
        }
      }

      oldNodes = retained;
      return;
    }

    if (oldNodes.length === 0) {
      if (initialHydration) {
        insertInitialNodes(element, newNodes, slotAnchor);
      } else {
        // Preserve the original CSR insertion behavior. In CSR, nested
        // render effects may already have inserted nodes that need positioning.
        const reference = slotAnchor?.parentNode === element ? slotAnchor : null;
        for (const node of newNodes) {
          element.insertBefore(node, reference);
        }
      }
    } else {
      const length = Math.min(oldNodes.length, newNodes.length);

      // Replace existing nodes.
      for (let i = 0; i < length; i++) {
        if (oldNodes[i] !== newNodes[i]) {
          element.replaceChild(newNodes[i], oldNodes[i]);
        }
      }

      const reference = slotAnchor?.parentNode === element ? slotAnchor : null;

      // Add new nodes immediately before the caller's anchor, when provided.
      for (let i = length; i < newNodes.length; i++) {
        element.insertBefore(newNodes[i], reference);
      }

      // Remove nodes that no longer exist.
      for (let i = newNodes.length; i < oldNodes.length; i++) {
        if (oldNodes[i].parentNode === element) {
          element.removeChild(oldNodes[i]);
        }
      }
    }

    oldNodes = newNodes;
  });

  return typeof before === "string" ? slotAnchor! : dispose;
}
