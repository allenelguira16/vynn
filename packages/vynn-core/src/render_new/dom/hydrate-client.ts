import { createDOMTemplateAdapter } from "./adapter";
import { hydrateTemplateProgram } from "./hydrate";
import type { DOMTemplateProgram } from "./program";
import type { MountedTemplate } from "./mount";
import { isRenderNewComponent, type RenderNewComponent } from "../component";
import { hydrateRenderNewComponent } from "./component";

/**
 * Hydrates a DOM tree previously rendered by renderTemplateProgramToString().\n * Deferred components execute within a component scope before adoption.
 * Compatible static nodes and dynamic child ranges are adopted. If the static
 * structure differs, the existing contents are replaced with a fresh mount.
 */
export function hydrateRenderNew(
  parent: Node,
  program: DOMTemplateProgram | RenderNewComponent,
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

  const adapter = createDOMTemplateAdapter(document);
  if (isRenderNewComponent(program)) {
    return hydrateRenderNewComponent(parent, program, adapter);
  }

  return hydrateTemplateProgram(parent, program, adapter);
}
