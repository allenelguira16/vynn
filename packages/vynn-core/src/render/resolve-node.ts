import { JSX } from "../jsx-runtime";

/**
 * Resolves a JSX value into an array of DOM nodes.
 *
 * Empty JSX values are represented by an empty text node, while strings,
 * numbers, DOM nodes, and nested arrays are normalized into a flat node list.
 *
 * @param child A function that returns the JSX value to resolve.
 * @returns The resolved DOM nodes.
 */
export function resolveNode(child: () => JSX.Element): Node[] {
  return resolveElement(child());
}

/**
 * Recursively resolves a JSX value into DOM nodes.
 *
 * @param element The JSX value to resolve.
 * @returns The DOM nodes represented by the JSX value.
 */
function resolveElement(element: JSX.Element): Node[] {
  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    return [new Text(String(element))];
  }

  if (element instanceof Node) {
    return [element];
  }

  return element.flatMap(resolveElement);
}
