import { createDOMTemplateAdapter } from "./adapter";
import { hydrateTemplateProgram } from "./hydrate";
import type { DOMTemplateProgram } from "./program";
import type { MountedTemplate } from "./mount";

/**
 * Hydrates a DOM tree previously rendered by renderTemplateProgramToString().
 * Compatible static nodes and dynamic child ranges are adopted. If the static
 * structure differs, the existing contents are replaced with a fresh mount.
 */
export function hydrateRenderNew(
  parent: Node,
  program: DOMTemplateProgram,
): MountedTemplate<Node> {
  if (
    !parent ||
    typeof parent !== "object" ||
    typeof parent.childNodes === "undefined"
  ) {
    throw new TypeError("[vynn]: hydrateRenderNew() expects a DOM parent node.");
  }

  const document = parent.nodeType === 9
    ? parent as Document
    : parent.ownerDocument;

  if (!document || document.nodeType !== 9) {
    throw new TypeError("[vynn]: hydrateRenderNew() could not resolve the parent's owner document.");
  }

  return hydrateTemplateProgram(parent, program, createDOMTemplateAdapter(document));
}
