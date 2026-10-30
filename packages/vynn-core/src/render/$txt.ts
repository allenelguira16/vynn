import type { JSX } from "../jsx-runtime";
import { createSSRText } from "./resolve-node";
import { claimHydrationText } from "../client/hydration";
import { isServer } from "../context/is-server-context";
import { isCreatingHeadElement } from "./$head";

/**
 * Creates a text node for static JSX text.
 *
 * The SSR branch returns Vynn's internal text node so the server renderer
 * can escape and serialize it. The DOM branch creates a real Text node,
 * rather than deferring the string-to-node conversion until tree resolution.
 */
export function $txt(value: string): JSX.Element {
  if (isServer()) {
    return createSSRText(value) as unknown as JSX.Element;
  }

  let element = document.createTextNode(value);

  if (!isCreatingHeadElement()) {
    element = claimHydrationText() || element;
  }
  // console.log(element, claimHydrationText());

  return element;
}
