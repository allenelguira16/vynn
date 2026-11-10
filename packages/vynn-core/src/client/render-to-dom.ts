import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener, isRootNode } from "../render/$cmpnt";
import { HTML_NAMESPACE, getChildDOMNamespace, withDOMNamespace } from "../render/namespace";
import { resolveNode } from "../render/resolve-node";

/**
 * Render the app to the dom
 *
 * @param App The root component to render.
 * @returns An mounting mechanism.
 */
export function renderToDOM(
  App: () => JSX.Element,
  id: Document | Element | DocumentFragment | string,
) {
  let cleanup: (() => void) | undefined;
  let mountedNodes: Node[] = [];
  let restoreDocument: (() => void) | undefined;
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
      initializeLazyContext();
      initializeAsyncContext();
      initializeErrorBoundaryContext();

      const app = withDOMNamespace(
        node instanceof Element
          ? getChildDOMNamespace(node.namespaceURI, node.localName)
          : HTML_NAMESPACE,
        () => resolveNode(App),
      );
      const nodes = app.map((element) => element);
      mountedNodes = nodes;

      if (node instanceof Document) {
        const documentNode = node;
        const root = nodes[0];
        const markers = nodes.slice(1);

        if (
          !(root instanceof Element) ||
          root.localName !== "html" ||
          markers.some((marker) => !isRootNode(marker))
        ) {
          throw new Error(
            "[Vynn App] Rendering into a Document requires a single <html> root element.",
          );
        }

        const previousRoot = documentNode.documentElement;
        const previousHead = previousRoot?.querySelector("head");
        const previousBody = previousRoot?.querySelector("body");
        const preservedHeadNodes = previousHead ? Array.from(previousHead.childNodes) : [];
        const preservedBodyNodes = previousBody ? Array.from(previousBody.childNodes) : [];
        const nextHead = root.querySelector("head");
        const nextBody = root.querySelector("body");

        if (!nextHead || !nextBody) {
          throw new Error(
            "[Vynn App] Rendering into a Document requires both <head> and <body> elements.",
          );
        }

        // Preserve shell resources and head entries registered while
        // resolving App before replacing the browser's initial document root.
        nextHead.append(...preservedHeadNodes);

        // Compiled root components return a lifecycle marker after the
        // document element. Keep those markers in the body so the unmount
        // observer can dispose the component without adding nodes to Document.
        nextBody.append(...preservedBodyNodes, ...markers);

        if (previousRoot) documentNode.replaceChild(root, previousRoot);
        else node.append(root);

        restoreDocument = () => {
          for (const marker of markers) marker.parentNode?.removeChild(marker);
          if (previousRoot && documentNode.documentElement === root) {
            if (previousHead) previousHead.append(...preservedHeadNodes);
            if (previousBody) previousBody.append(...preservedBodyNodes);
            documentNode.replaceChild(previousRoot, root);
          } else if (!previousRoot && documentNode.documentElement === root) {
            documentNode.removeChild(root);
          }
        };
      } else {
        node.append(...nodes);
      }

      releaseUnmountListener = addUnmountListener();
    });

    cleanup = () => {
      try {
        disposeOwner(owner);
      } finally {
        try {
          if (restoreDocument) {
            restoreDocument();
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
