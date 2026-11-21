import type { SSR_ELEMENT } from "./resolve-node";
import { assertSafeAttributeName } from "../attribute-name";
import { booleanAttributes, getAttributeName, serializeStyleValue, type AttributeValue } from "../shared/attribute";
import { HTML_NAMESPACE } from "../namespace";

export function $attr<E extends Element>(
  element: E,
  name: string,
  value: AttributeValue | (() => AttributeValue),
): void {
  const next = typeof value === "function" ? value() : value;
  assertSafeAttributeName(name);
  const node = element as unknown as SSR_ELEMENT;

  if (name === "html") {
    if (next == null) {
      delete node.innerHTML;
    } else {
      if (node.children.length > 0) {
        throw new Error("[vynn]: An element cannot have both the html prop and children.");
      }
      node.innerHTML = String(next);
    }
    return;
  }

  const key = getAttributeName(node.namespaceURI, name);
  if (next == null) {
    delete node.attributes[key];
  } else if (key === "style") {
    node.attributes[key] = serializeStyleValue(next);
  } else if (node.namespaceURI === HTML_NAMESPACE && booleanAttributes.has(key.toLowerCase())) {
    if (next) node.attributes[key] = "";
    else delete node.attributes[key];
  } else {
    node.attributes[key] = String(next);
  }
}