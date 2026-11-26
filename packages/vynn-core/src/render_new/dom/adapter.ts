import type { TemplateAdapter } from "../template/factory";
import type {
  TemplateNamespace,
  TemplateReferenceKind,
} from "../template/types";

const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
const MATHML_NAMESPACE_URI = "http://www.w3.org/1998/Math/MathML";

/**
 * Browser DOM implementation of the template host contract.
 *
 * The adapter receives its Document explicitly. It therefore works with
 * iframes, JSDOM, and other DOM realms without depending on globalThis.document.
 */
export type DOMTemplateAdapter = TemplateAdapter<DocumentFragment, Node>;

function assertDocument(document: Document): void {
  if (
    !document ||
    typeof document !== "object" ||
    document.nodeType !== 9 ||
    typeof document.createElement !== "function" ||
    typeof document.createElementNS !== "function" ||
    typeof document.createDocumentFragment !== "function"
  ) {
    throw new TypeError("[vynn]: createDOMTemplateAdapter() expects a DOM Document.");
  }
}

function assertNamespace(namespace: TemplateNamespace): void {
  if (
    namespace !== "html" &&
    namespace !== "svg" &&
    namespace !== "mathml"
  ) {
    throw new TypeError("[vynn]: A DOM template has an unsupported namespace.");
  }
}

function parseHTMLDocument(document: Document, markup: string): DocumentFragment {
  const DOMParserConstructor = document.defaultView?.DOMParser;
  if (!DOMParserConstructor) {
    throw new Error("[vynn]: Full-document templates require a DOMParser implementation.");
  }

  const parsed = new DOMParserConstructor().parseFromString(markup, "text/html");
  const root = parsed.documentElement;
  if (!root || root.localName !== "html") {
    throw new SyntaxError("[vynn]: A full-document template must have one <html> root.");
  }

  const fragment = document.createDocumentFragment();
  fragment.appendChild(document.importNode(root, true));
  return fragment;
}

function parseHTML(document: Document, markup: string): DocumentFragment {
  if (/^\s*<html(?:\s|>)/i.test(markup)) {
    return parseHTMLDocument(document, markup);
  }

  const template = document.createElement("template") as HTMLTemplateElement;
  template.innerHTML = markup;

  if (!template.content || template.content.nodeType !== 11) {
    throw new Error("[vynn]: This DOM implementation does not support template content.");
  }

  return template.content;
}

/**
 * Parses SVG and MathML fragments in their native namespace context.
 *
 * HTMLTemplateElement parses markup using the HTML fragment parser. Wrapping
 * the fragment in its corresponding integration root makes descendants use
 * the correct namespace, then the wrapper itself is discarded.
 */
function parseNamespacedFragment(
  document: Document,
  markup: string,
  namespace: Exclude<TemplateNamespace, "html">,
): DocumentFragment {
  const wrapperTag = namespace === "svg" ? "svg" : "math";
  const namespaceURI = namespace === "svg"
    ? SVG_NAMESPACE_URI
    : MATHML_NAMESPACE_URI;
  const template = document.createElement("template") as HTMLTemplateElement;

  template.innerHTML =
    "<" +
    wrapperTag +
    ' xmlns="' +
    namespaceURI +
    '">' +
    markup +
    "</" +
    wrapperTag +
    ">";

  const wrapper = template.content.firstChild;

  if (
    !wrapper ||
    wrapper.nodeType !== 1 ||
    (wrapper as Element).namespaceURI !== namespaceURI
  ) {
    throw new Error(
      "[vynn]: Failed to create the " + namespace + " template parsing context.",
    );
  }

  const fragment = document.createDocumentFragment();

  while (wrapper.firstChild) {
    fragment.appendChild(wrapper.firstChild);
  }

  return fragment;
}

function parse(
  document: Document,
  markup: string,
  namespace: TemplateNamespace,
): DocumentFragment {
  if (typeof markup !== "string") {
    throw new TypeError("[vynn]: DOM template markup must be a string.");
  }

  assertNamespace(namespace);

  if (namespace === "html") {
    return parseHTML(document, markup);
  }

  return parseNamespacedFragment(document, markup, namespace);
}

function cloneBlueprint(blueprint: DocumentFragment): readonly Node[] {
  if (
    !blueprint ||
    typeof blueprint !== "object" ||
    blueprint.nodeType !== 11 ||
    typeof blueprint.cloneNode !== "function"
  ) {
    throw new TypeError("[vynn]: A DOM template blueprint must be a DocumentFragment.");
  }

  const clone = blueprint.cloneNode(true) as DocumentFragment;
  return Array.from(clone.childNodes);
}

function getChild(parent: Node, index: number): Node | null {
  if (
    !parent ||
    typeof parent !== "object" ||
    !parent.childNodes ||
    typeof parent.childNodes.item !== "function"
  ) {
    throw new TypeError("[vynn]: DOM template child lookup expects a Node.");
  }

  if (!Number.isSafeInteger(index) || index < 0) {
    throw new TypeError("[vynn]: DOM template child index must be a non-negative integer.");
  }

  return parent.childNodes.item(index);
}

function getKind(node: Node): TemplateReferenceKind {
  if (!node || typeof node !== "object" || typeof node.nodeType !== "number") {
    throw new TypeError("[vynn]: DOM template reference resolution expects a Node.");
  }

  switch (node.nodeType) {
    case 1:
      return "element";
    case 3:
      return "text";
    case 8:
      return "anchor";
    default:
      throw new TypeError(
        "[vynn]: DOM node type " + node.nodeType + " cannot be used as a template reference.",
      );
  }
}

/**
 * Creates a TemplateAdapter backed by standard DOM APIs.
 *
 * HTML is parsed through template.content. SVG and MathML fragments are parsed
 * inside a namespace-specific wrapper so their descendant nodes retain the
 * correct namespace. Every clone is deep and produces an independent root set.
 */
export function createDOMTemplateAdapter(document: Document): DOMTemplateAdapter {
  assertDocument(document);

  const adapter: DOMTemplateAdapter = {
    parse(markup, namespace) {
      return parse(document, markup, namespace);
    },

    clone(blueprint) {
      return cloneBlueprint(blueprint);
    },

    getChild(parent, index) {
      return getChild(parent, index);
    },

    getKind(node) {
      return getKind(node);
    },
  };

  return Object.freeze(adapter);
}
