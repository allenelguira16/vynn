import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeLazyContext } from "../context/lazy-context";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener } from "../render/$cmpnt";
import { resolveNode } from "../render/resolve-node";
import { initializeHeadContext } from "../context/head-context";
import { getChildDOMNamespace, HTML_NAMESPACE, withDOMNamespace } from "../render/namespace";

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

  let node: DocumentFragment | Element | null;

  if (id instanceof Element || id instanceof DocumentFragment) {
    node = id;
  } else if (id instanceof Document) {
    node = id.documentElement;
  } else {
    node = document.querySelector(id) as typeof node;
  }

  if (node instanceof Element || node instanceof DocumentFragment) {
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

      node.append(...nodes);

      addUnmountListener();
    });

    cleanup = () => disposeOwner(owner);
  } else {
    throw new Error("Node must be of type Element");
  }

  return (): void => {
    if (!cleanup) {
      throw new Error("Can only unmount if the app is mounted");
    }

    cleanup();
  };
}
