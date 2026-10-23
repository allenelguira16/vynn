import { initializeAsyncID } from "../context/async-id";
import { initializeAsyncValues } from "../context/async-values";
import { initializeLazyID } from "../context/lazy-id";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener } from "./$cmpnt";
import { resolveNode } from "./resolve-node";

/**
 * Render the app to the dom
 *
 * @param App The root component to render.
 * @returns An mounting mechanism.
 */
export function renderToDOM(
  App: () => JSX.Element,
  id: Document | HTMLElement | DocumentFragment | string,
) {
  let cleanup: (() => void) | undefined;

  let node: DocumentFragment | HTMLElement | null;

  if (id instanceof HTMLElement || id instanceof DocumentFragment) {
    node = id;
  } else if (id instanceof Document) {
    node = id.documentElement;
  } else {
    node = document.querySelector(id) as typeof node;
  }

  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    const owner = createOwner();

    runWithOwner(owner, () => {
      initializeAsyncValues();

      initializeAsyncID();
      initializeLazyID();

      const app = resolveNode(App);
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
