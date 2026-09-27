import { $effect } from "../reactivity/$effect";

type AttributeValue = string | number | boolean | null | undefined;

export function $attr(
  element: Node,
  name: string,
  value: AttributeValue | (() => AttributeValue),
) {
  if (!(element instanceof HTMLElement)) return;

  $effect(() => {
    const attribute = typeof value === "function" ? value() : value;
    if (attribute === null || attribute === undefined) {
      element.removeAttribute(name);
      return;
    }

    if (typeof attribute === "boolean") {
      element.toggleAttribute(name, attribute);
      return;
    }

    element.setAttribute(name, String(attribute));
  });
}
