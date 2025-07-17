import { JSX } from "~/types";
import { IS_LOG_JSX, ssrDomWalker, toArray } from "~/util";

/**
 * get the node for a JSX element
 *
 * @param jsxElement - The JSX element to get the node for.
 * @returns The node for the JSX element.
 */
export function getNode<T extends Node>(jsxElement: JSX.Element): T {
  if (jsxElement instanceof Node) {
    return jsxElement as T;
  }

  if (typeof jsxElement === "string" || typeof jsxElement === "number") {
    const { currentNode, next } = ssrDomWalker();

    if (currentNode instanceof Text && !IS_LOG_JSX) {
      if (currentNode.textContent !== String(jsxElement)) {
        throw new Error(
          "Hydration mismatch because the initial UI does not match what was rendered on the server",
        );
      }

      next();
      return currentNode as unknown as T;
    }

    return document.createTextNode(String(jsxElement)) as unknown as T;
  }

  throw new Error(`Unknown value: ${jsxElement}`);
}

export function getNodes<T extends Node>(jsxElement: JSX.Element) {
  return toArray(getNode<T>(jsxElement)).flat();
}
