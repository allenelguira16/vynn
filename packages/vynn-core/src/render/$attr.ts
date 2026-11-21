import { isServer } from "../context/is-server-context";
import { $attr as clientAttr, hasRawHTMLContent, setDOMAttributeValue } from "./client/$attr";
import { $attr as serverAttr } from "./server/$attr";
import type { AttributeValue } from "./shared/attribute";

export type { AttributeValue } from "./shared/attribute";
export { hasRawHTMLContent, setDOMAttributeValue };

export function $attr<E extends Element>(element: E, name: string, value: AttributeValue | (() => AttributeValue)): void {
  if (isServer()) return serverAttr(element, name, value);
  clientAttr(element, name, value);
}