import { claimHydrationText, isHydrationClaimActive } from "../../client/hydration";
import { synchronizeHydrationText } from "../../client/hydration-diagnostics";
import type { JSX } from "../../types/jsx";

/** Resolve a JSX result into browser DOM nodes, claiming SSR nodes when hydrating. */
export function resolveNode(child: () => JSX.Element, claimText = true): Node[] {
  return resolveElement(child(), claimText);
}

export function resolveElement(element: JSX.Element, claimText = true): Node[] {
  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    const value = String(element);
    const text = document.createTextNode(value);

    if (claimText) {
      const hydrating = isHydrationClaimActive();
      const claimed = claimHydrationText();

      if (!hydrating) {
        if (claimed) return [claimed];
      } else if (synchronizeHydrationText(claimed, value)) {
        return [claimed];
      }
    }

    return [text];
  }

  if (element instanceof Node) {
    return [element];
  }

  if (typeof element === "function") {
    return resolveElement((element as unknown as () => JSX.Element)(), claimText);
  }

  return element.flatMap((child) => resolveElement(child, claimText));
}

