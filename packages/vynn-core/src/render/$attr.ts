import { $effect } from "../reactivity/$effect";
import { escapeHtml } from "../utils/escape-html";
import { getRenderMode } from "../utils/render-mode";
import { SSR_ELEMENT } from "./resolve-node";

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
export function $attr<E extends HTMLElement>(
  element: E,
  name: string,
  value: AttributeValue | (() => AttributeValue),
): void {
  if (getRenderMode()) {
    $effect(() => {
      const node = element as unknown as SSR_ELEMENT;
      const next = typeof value === "function" ? value() : value;

      if (next === true) {
        node.attributes[name] = "";
      } else if (next === false) {
        delete node.attributes[name.toLowerCase()];
      } else if (typeof next === "number" || typeof next === "string") {
        node.attributes[name.toLowerCase()] = escapeHtml(String(next));
      } else {
        console.log(node, next);
      }
    });
    return;
  }

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
