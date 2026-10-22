import type { JSX } from "../jsx-runtime";
import { getRenderMode } from "../context/render-mode";
import { createSSRText } from "./resolve-node";
import { claimHydrationText } from "./hydration";

/**
 * Creates a text node for static JSX text.
 *
 * The SSR branch returns Vynn's internal text node so the server renderer
 * can escape and serialize it. The DOM branch creates a real Text node,
 * rather than deferring the string-to-node conversion until tree resolution.
 */
export function $text(value: string): JSX.Element {
  if (getRenderMode()) {
    return createSSRText(value) as unknown as JSX.Element;
  }

  const element = claimHydrationText() || document.createTextNode(value);
  return element;
}
