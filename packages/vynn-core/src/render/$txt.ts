import type { JSX } from "../jsx-runtime";

import { claimHydrationText, isHydrationClaimActive } from "../client/hydration";
import { synchronizeHydrationText } from "../client/hydration-diagnostics";
import { isServer } from "../context/is-server-context";
import { isCreatingHeadElement } from "./$head";
import { createSSRText } from "./resolve-node";

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

  const element = document.createTextNode(value);

  if (isCreatingHeadElement()) return element;

  const hydrating = isHydrationClaimActive();
  const claimed = claimHydrationText();

  if (!hydrating) return claimed ?? element;

  return synchronizeHydrationText(claimed, value) ? claimed : element;
}
