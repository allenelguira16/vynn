import { $effect } from "../reactivity/$effect";
import { escapeHtml } from "../utils/escape-html";
import { getRenderMode } from "../context/render-mode";
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

const booleanAttributes = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
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
    // $effect(() => {
    const node = element as unknown as SSR_ELEMENT;
    const key = name.toLowerCase();
    const next = typeof value === "function" ? value() : value;

    if (next == null) {
      delete node.attributes[key];
    } else if (booleanAttributes.has(key)) {
      if (next) {
        node.attributes[key] = "";
      } else {
        delete node.attributes[key];
      }
    } else {
      // Keep the raw value here. The serializer escapes it exactly once.
      node.attributes[key] = String(next);
    }
    // });
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
