/**
 * Creates a native DOM element for the given HTML tag name.
 *
 * @param key The HTML tag name.
 * @returns The newly created DOM element.
 */
export function $tmpl(key: keyof HTMLElementTagNameMap): HTMLElement {
  const element = document.createElement(key);

  return element;
}
