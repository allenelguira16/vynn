import { runWithRuntimeContextRoot } from "../runtime/context";
import { EMPTY_TEXT_SSR_MARKER } from "../const";
import { initializeAsyncHydrationRuntime } from "../runtime/async/hydration";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener } from "../render/$cmpnt";
import { setStaticTemplateHydrator } from "../render/$template";
import { HTML_NAMESPACE, getChildDOMNamespace, withDOMNamespace } from "../render/namespace";
import { resolveNode } from "../render/resolve-node";
import {
  claimHydrationElement,
  claimHydrationText,
  isHydrationClaimActive,
  withHydration,
} from "./hydration";
import {
  isHydrationElementCompatible,
  synchronizeHydrationText,
} from "./hydration-diagnostics";

function hydrateStaticTemplate(root: Element): Element {
  if (!isHydrationClaimActive()) return root;

  const claimedRoot = claimHydrationElement<Element>();
  if (!claimedRoot) return root;

  const parent = claimedRoot.parentNode;
  const nextSibling = claimedRoot.nextSibling;
  let compatible = isHydrationElementCompatible(
    claimedRoot,
    root.localName,
    root.namespaceURI,
  );

  const claimChildren = (expectedParent: Node): void => {
    let child = expectedParent.firstChild;

    while (child) {
      const next = child.nextSibling;

      if (child.nodeType === Node.ELEMENT_NODE) {
        const expected = child as Element;
        const claimed = claimHydrationElement<Element>();

        if (
          !isHydrationElementCompatible(
            claimed,
            expected.localName,
            expected.namespaceURI,
          )
        ) {
          compatible = false;
        }

        claimChildren(expected);
      } else if (child.nodeType === Node.TEXT_NODE) {
        if (!synchronizeHydrationText(claimHydrationText(), child.nodeValue ?? "")) {
          compatible = false;
        }
      } else if (
        child.nodeType === Node.COMMENT_NODE &&
        (child as Comment).data === EMPTY_TEXT_SSR_MARKER
      ) {
        if (!claimHydrationText()) compatible = false;
      }

      child = next;
    }
  };

  claimChildren(root);

  if (compatible && claimedRoot) return claimedRoot;

  if (parent) {
    if (claimedRoot.parentNode === parent) {
      parent.replaceChild(root, claimedRoot);
    } else {
      parent.insertBefore(
        root,
        nextSibling?.parentNode === parent ? nextSibling : null,
      );
    }
  }

  return root;
}

// Installed only in client bundles that include hydrateToDOM. It remains
// inert outside an active root or lazy-boundary hydration pass.
setStaticTemplateHydrator(hydrateStaticTemplate);

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

    runWithRuntimeContextRoot(() => runWithOwner(owner, () => {
      initializeAsyncHydrationRuntime();

      withHydration(() => {
        mountedNodes = withDOMNamespace(
          node instanceof Element
            ? getChildDOMNamespace(node.namespaceURI, node.localName)
            : HTML_NAMESPACE,
          () => resolveNode(App),
        );
      }, node);

      releaseUnmountListener = addUnmountListener();
    }));

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
