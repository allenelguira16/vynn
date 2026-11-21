import type { JSX } from "../../types/jsx";
import { claimHydrationText, isHydrationClaimActive } from "../../client/hydration";
import { synchronizeHydrationText } from "../../client/hydration-diagnostics";
import { isCreatingHeadElement } from "../head-runtime";

export function $text(value: string): JSX.Element {
  const element = document.createTextNode(value);
  if (isCreatingHeadElement()) return element;
  const hydrating = isHydrationClaimActive();
  const claimed = claimHydrationText();
  if (!hydrating) return claimed ?? element;
  return synchronizeHydrationText(claimed, value) ? claimed : element;
}