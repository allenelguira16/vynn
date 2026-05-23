import { IS_LOG_JSX } from "~/util/log-jsx";
import { ssrDomWalker } from "~/util/ssr-dom-walker";

const xmlnsStack: (string | undefined)[] = [];

export function xlmnsHandler(props: Record<string, any>) {
  return {
    start: () => xmlnsStack.push(props.xmlns?.() ?? xmlnsStack[xmlnsStack.length - 1]),
    end: () => xmlnsStack.pop(),
  };
}

export function createElement(tag: string) {
  const { currentNode, next } = ssrDomWalker();

  if (currentNode instanceof Element && !IS_LOG_JSX) {
    if (currentNode.tagName.toLowerCase() !== tag) {
      console.error(
        "Hydration mismatch because the initial UI does not match what was rendered on the server",
      );
    }

    next();
    return currentNode;
  }

  const currentXmlns = xmlnsStack[xmlnsStack.length - 1];
  return currentXmlns ? document.createElementNS(currentXmlns, tag) : document.createElement(tag);
}
