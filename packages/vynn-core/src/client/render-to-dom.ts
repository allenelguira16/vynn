import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext } from "../context/head-context";
import { initializeLazyContext } from "../context/lazy-context";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener } from "../render/$cmpnt";
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

      if (node instanceof Document) {
        const root = nodes[0];

        if (nodes.length !== 1 || !(root instanceof Element) || root.localName !== "html") {
          throw new Error("[Vynn App] Rendering into a Document requires a single <html> root element.");
        }

        const nextHead = root.querySelector("head");
        const nextBody = root.querySelector("body");

        if (!nextHead || !nextBody) {
          throw new Error("[Vynn App] Rendering into a Document requires both <head> and <body> elements.");
        }

        // Preserve shell resources and head entries registered while
        // resolving App before replacing the browser's initial document root.
        nextHead.append(...Array.from(node.head.childNodes));
        nextBody.append(...Array.from(node.body.childNodes));

        const previousRoot = node.documentElement;
        if (previousRoot) node.replaceChild(root, previousRoot);
        else node.append(root);
      } else {
        node.append(...nodes);
      }

      addUnmountListener();
    });

    cleanup = () => disposeOwner(owner);
  } else {
    throw new Error("Node must be a Document, Element, or DocumentFragment");
  }

  return (): void => {
    if (!cleanup) {
      throw new Error("Can only unmount if the app is mounted");
    }

    cleanup();
  };
}
