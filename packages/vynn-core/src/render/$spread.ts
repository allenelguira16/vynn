import { $effect } from "../reactivity/$effect";
import { $attr } from "./$attr";

/**
 * Reactively applies an object of properties and attributes to a DOM element.
 *
 * When the properties change, removed keys are cleared and existing keys are
 * updated through `$attr`.
 *
 * @template P The type of the properties object.
 * @param element The DOM element to update.
 * @param props A function that returns the properties to apply.
 */
export function $spread<P extends Record<string, any>>(
  element: Element,
  props: () => P,
): void {
  let previous = new Set<string>();

  $effect(() => {
    const next = props();
    const keys = new Set(Object.keys(next));

    for (const key of previous) {
      if (!keys.has(key)) {
        $attr(element, key, undefined);
      }
    }

    for (const [key, value] of Object.entries(next)) {
      $attr(element, key, value);
    }

    previous = keys;
  });
}
