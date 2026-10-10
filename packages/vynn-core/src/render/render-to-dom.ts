import { withRenderBoundary } from "../components/boundary";
import { JSX } from "../jsx-runtime";
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
    withRenderBoundary(node, () => {
      const app = resolveNode(App);
      const nodes = app.map((element) => element);

      node.append(...nodes);

      cleanup = () => {
        node.replaceChildren();
      };

      addUnmountListener();
    });
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
