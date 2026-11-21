import { isServer } from "../context/is-server-context";
import type { SSR_ELEMENT, SSR_NODE } from "./server/resolve-node";
import {
  $template as clientTemplate,
  $child as clientChild,
  $sibling as clientSibling,
  $finishTemplate as clientFinish,
  $claimTemplateAnchor as clientClaim,
} from "./client/$template";
import {
  $template as serverTemplate,
  $child as serverChild,
  $sibling as serverSibling,
  $finishTemplate as serverFinish,
  $claimTemplateAnchor as serverClaim,
} from "./server/$template";

export function $template<T extends Element = Element>(markup: string): () => T {
  return isServer() ? serverTemplate<T>(markup) : clientTemplate<T>(markup);
}

export function $child<E extends Element = Element>(parent: Element | SSR_ELEMENT): E {
  return isServer() ? serverChild<E>(parent as SSR_ELEMENT) : clientChild<E>(parent as Element);
}

export function $sibling<E extends Element = Element>(node: Node | SSR_NODE, count = 1): E {
  return isServer()
    ? serverSibling<E>(node as SSR_NODE, count)
    : clientSibling<E>(node as Node, count);
}

export function $claimTemplateAnchor(parent: Element | SSR_ELEMENT, id: string): Node | SSR_NODE {
  return isServer()
    ? serverClaim(parent as SSR_ELEMENT, id)
    : clientClaim(parent as Element, id);
}

export function $finishTemplate(root: Element | SSR_ELEMENT): void {
  if (isServer()) serverFinish(root as SSR_ELEMENT);
  else clientFinish(root as Element);
}
