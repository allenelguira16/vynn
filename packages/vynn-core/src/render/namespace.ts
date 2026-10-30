export const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let currentNamespace = HTML_NAMESPACE;

/**
 * Runs a render callback in the namespace used by its parent element.
 *
 * Namespace state is scoped to the synchronous child render. Nested inserts
 * restore their parent's namespace when they finish, including across
 * component boundaries.
 */
export function withDOMNamespace<T>(
  namespace: string,
  callback: () => T,
): T {
  const previous = currentNamespace;
  currentNamespace = namespace;

  try {
    return callback();
  } finally {
    currentNamespace = previous;
  }
}

/** Returns the namespace active for the current JSX child render. */
export function getCurrentDOMNamespace(): string {
  return currentNamespace;
}

/** Returns the namespace for a newly created JSX element. */
export function getElementNamespace(tagName: string): string {
  // An SVG root always enters the SVG namespace, even from an HTML parent.
  return tagName === "svg" ? SVG_NAMESPACE : currentNamespace;
}

/** Returns the namespace inherited by an element's children. */
export function getChildDOMNamespace(
  namespace: string,
  tagName: string,
): string {
  // foreignObject is an SVG integration point: its children are HTML.
  if (namespace === SVG_NAMESPACE && tagName === "foreignObject") {
    return HTML_NAMESPACE;
  }

  return namespace || HTML_NAMESPACE;
}
