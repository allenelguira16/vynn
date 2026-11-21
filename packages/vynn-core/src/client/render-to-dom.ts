import { initializeAsyncContext } from "../context/async-context";
import { initializeErrorBoundaryContext } from "../context/error-boundary-context";
import { initializeHeadContext, refreshHeadCandidates } from "../context/head-context";
import { synchronizeHeadContext } from "../render/head-runtime";
import { initializeLazyContext } from "../context/lazy-context";
import { JSX } from "../jsx-runtime";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { addUnmountListener, isRootNode } from "../render/client/component-nodes";
import { HTML_NAMESPACE, getChildDOMNamespace, withDOMNamespace } from "../render/namespace";
import { resolveNode } from "../render/client/resolve-node";

function getHeadMetadataIdentity(element: Element): string | undefined {
  const tag = element.localName;
  if (tag !== "title" && tag !== "meta" && tag !== "link") return undefined;

  const collection =
    tag === "meta"
      ? ["og:image", "og:video", "og:audio", "og:locale:alternate"].some((root) => {
          const property = element.getAttribute("property")?.toLowerCase();
          return property === root || property?.startsWith(root + ":");
        })
      : false;

  if (collection) return undefined;

  if (tag === "title") return "title";

  if (tag === "meta") {
    const charset = element.getAttribute("charset");
    if (charset !== null) return "meta:charset";

    const name = element.getAttribute("name");
    if (name) return "meta:name:" + name.toLowerCase();

    const property = element.getAttribute("property");
    if (property) return "meta:property:" + property.toLowerCase();

    const httpEquiv = element.getAttribute("http-equiv");
    if (httpEquiv) return "meta:http-equiv:" + httpEquiv.toLowerCase();
  }

  const rel = element.getAttribute("rel")?.toLowerCase() ?? "";
  const href = element.getAttribute("href") ?? "";
  return rel === "canonical" ? "link:canonical" : "link:" + rel + ":" + href;
}

function preserveDocumentHeadNodes(
  previousHead: HTMLHeadElement | null,
  nextHead: HTMLHeadElement,
): void {
  if (!previousHead) return;

  const identities = new Set(
    Array.from(nextHead.querySelectorAll("title, meta, link"))
      .map(getHeadMetadataIdentity)
      .filter((identity): identity is string => identity !== undefined),
  );

  let fallbackTemplate: HTMLTemplateElement | null = null;

  for (const child of Array.from(previousHead.childNodes)) {
    if (
      child instanceof HTMLTemplateElement &&
      child.hasAttribute("data-vynn-head-fallback")
    ) {
      fallbackTemplate = child;
      continue;
    }

    if (child instanceof Element) {
      const identity = getHeadMetadataIdentity(child);
      if (identity !== undefined) {
        if (identities.has(identity)) continue;
        identities.add(identity);
      }
    }

    nextHead.append(child);
  }

  if (fallbackTemplate) {
    for (const child of Array.from(fallbackTemplate.content.children)) {
      const identity = getHeadMetadataIdentity(child);

      if (identity !== undefined) {
        if (identities.has(identity)) child.remove();
        else identities.add(identity);
      }
    }

    if (fallbackTemplate.content.childNodes.length > 0) {
      nextHead.append(fallbackTemplate);
    }
  }
}

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
  let headContext: ReturnType<typeof initializeHeadContext> | undefined;

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
      const currentHeadContext = initializeHeadContext();
      headContext = currentHeadContext;
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
        const preservedBodyNodes = previousBody ? Array.from(previousBody.childNodes) : [];
        const nextHead = root.querySelector("head");
        const nextBody = root.querySelector("body");

        if (!nextHead || !nextBody) {
          throw new Error(
            "[Vynn App] Rendering into a Document requires both <head> and <body> elements.",
          );
        }

        // Preserve shell resources and non-duplicate metadata. The app's
        // document template is authoritative when it declares the same head
        // identity as the previous client shell.
        preserveDocumentHeadNodes(previousHead, nextHead);

        // Compiled root components return a lifecycle marker after the
        // document element. Keep those markers in the body so the unmount
        // observer can dispose the component without adding nodes to Document.
        nextBody.append(...preservedBodyNodes, ...markers);

        if (previousRoot) documentNode.replaceChild(root, previousRoot);
        else node.append(root);

        // App-level and route-level head declarations may have been rendered
        // while the previous document was still active. Re-target their
        // candidates at the newly installed document and reconcile them there.
        refreshHeadCandidates(currentHeadContext);
        synchronizeHeadContext(currentHeadContext);

        restoreDocument = () => {
          for (const marker of markers) marker.parentNode?.removeChild(marker);
          if (previousRoot && documentNode.documentElement === root) {
            if (previousHead) previousHead.replaceChildren(...currentHeadContext.initialNodes);
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
        if (restoreDocument && headContext) headContext.preserveInitialDocument = true;
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
