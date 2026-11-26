import type { JSX } from "../jsx-runtime";

import {
  claimHydrationText,
  isHydrationClaimActive,
  isHydrating,
  synchronizeHydrationText,
} from "../client/hydration-runtime";
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
  // Primitive text bindings use a single retained Text reference. The
  // generic Node[] path is created only when a child actually renders a
  // fragment, element, or component.
  let oldNodes: Node[] | undefined;
  let oldText: Text | undefined;
  let rendered = false;

  const dispose = $renderEffect(() => {
    const initialHydration = !rendered && isHydrating();
    const childNamespace = getChildDOMNamespace(element.namespaceURI, element.localName);
    const renderChild = typeof child === "function" ? child : () => child;

    if (element.localName === "title") {
      const newNodes = withDOMNamespace(childNamespace, () =>
        withHeadElementCreation(() => resolveNode(renderChild, false)),
      );

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
          let current = element.firstChild;

          while (current) {
            initialTitleNodes.push(current);
            current = current.nextSibling;
          }
        }
      }

      const textValue = newNodes.map((node) => node.textContent ?? "").join("");
      const existingText =
        oldText ??
        oldNodes?.find((node): node is Text => node.nodeType === Node.TEXT_NODE) ??
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
      for (const node of [...(oldNodes ?? []), ...initialTitleNodes]) {
        if (!retainedSet.has(node) && node.parentNode === element) {
          element.removeChild(node);
        }
      }

      oldText = retained[0] instanceof Text ? retained[0] : undefined;
      oldNodes = retained;
      rendered = true;
      return;
    }

    const resolved = withDOMNamespace(childNamespace, () => {
      const value = renderChild();

      // Match resolveElement's primitive semantics, but avoid creating a
      // temporary Text node and singleton Node[] for the common text case.
      if (
        value === null ||
        value === undefined ||
        value === false ||
        typeof value === "string" ||
        typeof value === "number"
      ) {
        return {
          kind: "text" as const,
          textValue:
            typeof value === "string" || typeof value === "number"
              ? String(value)
              : "",
          claimText: typeof value === "string" || typeof value === "number",
        };
      }

      return { kind: "nodes" as const, nodes: resolveNode(() => value) };
    });

    if (resolved.kind === "text") {
      let text = oldText;

      if (!text) {
        if (resolved.claimText) {
          const hydrating = isHydrationClaimActive();
          const claimed = claimHydrationText();

          if (claimed && (!hydrating || synchronizeHydrationText(claimed, resolved.textValue))) {
            text = claimed;
          }
        }

        text ??= document.createTextNode(resolved.textValue);
      }

      text.data = resolved.textValue;

      // Retire a previous non-scalar child before switching to this Text node.
      for (const node of oldNodes ?? []) {
        if (node !== text && node.parentNode === element) {
          element.removeChild(node);
        }
      }
      oldNodes = undefined;

      if (text.parentNode !== element) {
        const reference = slotAnchor?.parentNode === element ? slotAnchor : null;
        element.insertBefore(text, reference);
      }

      oldText = text;
      rendered = true;
      return;
    }

    const newNodes = resolved.nodes;
    const previousNodes = oldNodes ?? (oldText ? [oldText] : []);

    if (previousNodes.length === 0) {
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
      const length = Math.min(previousNodes.length, newNodes.length);

      // Replace existing nodes.
      for (let i = 0; i < length; i++) {
        if (previousNodes[i] !== newNodes[i]) {
          element.replaceChild(newNodes[i], previousNodes[i]);
        }
      }

      const reference = slotAnchor?.parentNode === element ? slotAnchor : null;

      // Add new nodes immediately before the caller's anchor, when provided.
      for (let i = length; i < newNodes.length; i++) {
        element.insertBefore(newNodes[i], reference);
      }

      // Remove nodes that no longer exist.
      for (let i = newNodes.length; i < previousNodes.length; i++) {
        if (previousNodes[i].parentNode === element) {
          element.removeChild(previousNodes[i]);
        }
      }
    }

    oldNodes = newNodes;
    oldText = undefined;
    rendered = true;
  });

  return typeof before === "string" ? slotAnchor! : dispose;
}
