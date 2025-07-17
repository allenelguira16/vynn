import { $effect } from "~/reactivity";
import { ssrDomWalker } from "~/util";

import { addEventListener, removeEventListener } from "./event-registry";

/**
 * apply the properties to the element
 *
 * @param element - The element to apply the properties to.
 * @param props - The properties to apply.
 */
export function applyProps(element: Element, props: Record<string, any>) {
  for (const key in props) {
    // Wait until hydration is done before starting the reactive effect
    const startEffect = () => {
      if (ssrDomWalker().isHydrating) {
        // Try again on the next animation frame
        requestAnimationFrame(startEffect);
        return;
      }

      // ✅ Hydration finished – now set up the reactive effect
      $effect(() => {
        const raw = props[key];
        const value = typeof raw === "function" && key !== "ref" ? raw() : raw;

        // Event listeners
        if (key.startsWith("on") && element instanceof HTMLElement) {
          const type = key.slice(2).toLowerCase();
          addEventListener(element, type, value);
          return () => removeEventListener(element, type);
        }

        // Controlled form elements
        const isFormControl =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement;

        if (
          key === "value" &&
          isFormControl &&
          typeof props["onInput"] !== "function" &&
          typeof props["onChange"] !== "function"
        ) {
          element.value = value;

          const revert = () => {
            if (element.value !== value) {
              element.value = value;
            }
          };

          element.setAttribute(key, value);
          element.addEventListener("input", revert);
          return () => element.removeEventListener("input", revert);
        }

        // Ref
        if (key === "ref" && typeof value === "function") {
          value(element);
          return;
        }

        // Style
        if (key === "style" && typeof value === "object" && element instanceof HTMLElement) {
          applyStyle(element, value);
          return;
        }

        // Boolean attributes
        if (typeof value === "boolean") {
          element.toggleAttribute(key, value);
          return;
        }

        if (key === "html" && typeof value === "string") {
          element.innerHTML = value;
          return;
        }

        // Default attribute handling
        element.setAttribute(key, value);
      });
    };

    // Kick off the polling
    startEffect();
  }
}

function isUnitlessProp(prop: string): boolean {
  // test if "0" without unit is valid
  return CSS.supports(prop, "0") && !CSS.supports(prop, "0px");
}

/**
 * apply the style to the element
 *
 * @param element - The element to apply the style to.
 * @param style - The style to apply.
 */
function applyStyle(element: HTMLElement, style: Partial<CSSStyleDeclaration>) {
  if (!(element instanceof HTMLElement)) return;

  for (const key in style) {
    if (!Object.hasOwn(style, key)) continue;

    const value = style[key];
    if (value == null) continue;

    if (key === "length" || key === "parentRule") continue;

    const isNumeric = typeof value === "number";
    const needsUnit = isNumeric && !isUnitlessProp(key);

    element.style[key] = isNumeric ? (needsUnit ? `${value}px` : `${value}`) : String(value);
  }
}
