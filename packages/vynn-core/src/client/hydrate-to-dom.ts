import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener } from "../render/$cmpnt";
import { HTML_NAMESPACE, getChildDOMNamespace, withDOMNamespace } from "../render/namespace";
import { resolveNode } from "../render/resolve-node";
import { withHydration } from "./hydration";

/**
 * Render the app to the dom
 *
 * @param App The root component to render.
 * @returns An mounting mechanism.
 */
export function hydrateToDOM(
  App: () => JSX.Element,
  id: Document | Element | DocumentFragment | string,
) {
  let cleanup: (() => void) | undefined;
  let mountedNodes: Node[] = [];
  let releaseUnmountListener: (() => void) | undefined;

  let node: Document | DocumentFragment | Element | null;

  if (id instanceof Element || id instanceof DocumentFragment) {
    node = id;
  } else if (id instanceof Document) {
    node = id;
  } else {
    node = document.querySelector(id) as typeof node;
  }

  if (node instanceof Document || node instanceof Element || node instanceof DocumentFragment) {
    const owner = createOwner();

    runWithOwner(owner, () => {
      initializeHeadContext();
      initializeAsyncContext();
      initializeLazyContext();
      initializeErrorBoundaryContext();

      withHydration(() => {
        mountedNodes = withDOMNamespace(
          node instanceof Element
            ? getChildDOMNamespace(node.namespaceURI, node.localName)
            : HTML_NAMESPACE,
          () => resolveNode(App),
        );
      }, node);

      releaseUnmountListener = addUnmountListener();
    });

    cleanup = () => {
      try {
        disposeOwner(owner);
      } finally {
        try {
          if (node instanceof Document) {
            // Keep the document shell valid while removing the hydrated app body.
            while (node.body?.firstChild) node.body.removeChild(node.body.firstChild);
          } else {
            for (const mountedNode of mountedNodes) {
              mountedNode.parentNode?.removeChild(mountedNode);
            }
          }
        } finally {
          releaseUnmountListener?.();
          releaseUnmountListener = undefined;
        }
      }
    };
  } else {
    throw new Error("Node must be a Document, Element, or DocumentFragment");
  }

  return (): void => {
    if (!cleanup) {
      throw new Error("Can only unmount if the app is mounted");
    }

    const dispose = cleanup;
    cleanup = undefined;
    dispose();
  };
}
