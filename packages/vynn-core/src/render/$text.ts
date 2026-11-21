import type { JSX } from "../jsx-runtime";

import { claimHydrationText, isHydrationClaimActive } from "../client/hydration";
import { synchronizeHydrationText } from "../client/hydration-diagnostics";

import { isCreatingHeadElement } from "./head-runtime";
import { createSSRText } from "./resolve-node";

/**
 * Creates a text node for static JSX text.
 *
 * Claiming happens immediately, when the fragment is evaluated, so static
 * text cannot be overtaken by a later dynamic child that resolves eagerly.
 */
export function $text(value: string): JSX.Element {
  if (import.meta.env.SSR) {
    return createSSRText(value) as unknown as JSX.Element;
  }

  const element = document.createTextNode(value);

  if (isCreatingHeadElement()) return element;

  const hydrating = isHydrationClaimActive();
  const claimed = claimHydrationText();

  if (!hydrating) return claimed ?? element;

  return synchronizeHydrationText(claimed, value) ? claimed : element;
}
