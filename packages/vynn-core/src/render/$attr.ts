import { $effect } from "../reactivity/$effect";

type AttributeValue = string | number | boolean | null | undefined;

// DOM properties that should be assigned directly instead of using attributes.
const properties = new Set([
  "value",
  "checked",
  "selected",
  "disabled",
  "multiple",
  "required",
  "readOnly",
  "muted",
  "indeterminate",
]);

/**
 * Sets a reactive DOM attribute or property.
 *
 * When `value` is a function, it is evaluated reactively and the attribute
 * or property is updated whenever its dependencies change.
 *
 * Known DOM properties are assigned directly. Other values are written as
 * HTML attributes, with `null` and `undefined` removing the attribute and
 * boolean values toggling it.
 *
 * @param element The DOM element to update.
 * @param name The property or attribute name.
 * @param value The value to assign, or a function that returns the value reactively.
 */
export function $attr(
  element: Node,
  name: string,
  value: AttributeValue | (() => AttributeValue),
): void {
  if (!(element instanceof HTMLElement)) return;

  $effect(() => {
    const next = typeof value === "function" ? value() : value;

    if (properties.has(name)) {
      (element as any)[name] = next;
      return;
    }

    if (next == null) {
      element.removeAttribute(name);
      return;
    }

    if (typeof next === "boolean") {
      element.toggleAttribute(name, next);
      return;
    }

    element.setAttribute(name, String(next));
  });
}
