import { $attr } from "./$attr";
import type { AttributeValue } from "../shared/attribute";

function isEventAttribute(name: string): boolean {
  return name.length > 2 && name.startsWith("on") && name[2] === name[2].toUpperCase();
}

export function $spread<E extends Element, P extends Record<string, any>>(element: E, props: () => P): void {
  const next = props() ?? ({} as P);
  for (const [name, value] of Object.entries(next)) {
    if (name === "key" || name === "children" || name === "ref" || isEventAttribute(name)) continue;
    $attr(element, name, value as AttributeValue);
  }
}