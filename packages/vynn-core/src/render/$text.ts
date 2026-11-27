import type { JSX } from "../jsx-runtime";

import {
  claimHydrationText,
  isHydrationClaimActive,
  synchronizeHydrationText,
} from "../client/hydration-runtime";

import { isCreatingHeadElement } from "./head-element-context";
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

  if (isCreatingHeadElement()) return document.createTextNode(value);

  const hydrating = isHydrationClaimActive();
  const claimed = claimHydrationText();

  if (claimed && (!hydrating || synchronizeHydrationText(claimed, value))) {
    return claimed;
  }

  return document.createTextNode(value);
}
