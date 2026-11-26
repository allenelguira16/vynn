import type { TemplateNamespace } from "../template/types";

const NAMESPACE_URIS: Record<TemplateNamespace, string | null> = {
  html: null,
  svg: "http://www.w3.org/2000/svg",
  mathml: "http://www.w3.org/1998/Math/MathML",
};

function assertDocument(document: Document): void {
  if (
    !document ||
    typeof document !== "object" ||
    document.nodeType !== 9 ||
    typeof document.createElement !== "function" ||
    typeof document.createElementNS !== "function" ||
    typeof document.createTextNode !== "function" ||
    typeof document.createComment !== "function" ||
    typeof document.createDocumentFragment !== "function"
  ) {
    throw new TypeError("[vynn]: DOM node creation expects a DOM Document.");
  }
}

/** Creates an element in the requested HTML, SVG, or MathML namespace. */
export function createDOMElement(
  document: Document,
  tagName: string,
  namespace: TemplateNamespace = "html",
): Element {
  assertDocument(document);

  if (typeof tagName !== "string" || tagName.trim().length === 0) {
    throw new TypeError("[vynn]: DOM element creation expects a non-empty tag name.");
  }

  if (!(namespace in NAMESPACE_URIS)) {
    throw new TypeError("[vynn]: DOM element creation received an unsupported namespace.");
  }

  const namespaceURI = NAMESPACE_URIS[namespace];

  return namespaceURI === null
    ? document.createElement(tagName)
    : document.createElementNS(namespaceURI, tagName);
}

/** Creates a text node without interpreting its value as markup. */
export function createDOMText(document: Document, value: string): Text {
  assertDocument(document);

  if (typeof value !== "string") {
    throw new TypeError("[vynn]: DOM text node content must be a string.");
  }

  return document.createTextNode(value);
}

/** Creates a comment node, commonly used as a structural insertion anchor. */
export function createDOMComment(document: Document, value = ""): Comment {
  assertDocument(document);

  if (typeof value !== "string") {
    throw new TypeError("[vynn]: DOM comment content must be a string.");
  }

  return document.createComment(value);
}

/** Creates an empty host fragment for staging a group of nodes. */
export function createDOMFragment(document: Document): DocumentFragment {
  assertDocument(document);
  return document.createDocumentFragment();
}
