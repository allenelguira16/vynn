import { createDOMTemplateAdapter } from "./adapter";
import { mountTemplateProgram, type DOMTemplateProgram } from "./program";
import type { MountedTemplate } from "./mount";
import { isRenderNewComponent, type RenderNewComponent } from "../component";
import { mountRenderNewComponent } from "./component";

/** Options for mounting one compiler-produced render_new program. */
export interface MountRenderNewOptions {
  /** Insert before this node instead of appending at the end. */
  readonly before?: Node | null;
}

/**
 * Mounts the result of a render_new-compiled component into a DOM parent.
 *
 * Compiler-generated component calls return deferred descriptors, so their
 * bodies execute inside an owned render scope. The returned handle owns the
 * complete component and template lifetime.
 */
export function mountRenderNew(
  parent: Node,
  program: DOMTemplateProgram | RenderNewComponent,
  options: MountRenderNewOptions = {},
): MountedTemplate<Node> {
  if (
    !parent ||
    typeof parent !== "object" ||
    typeof parent.insertBefore !== "function"
  ) {
    throw new TypeError("[vynn]: mountRenderNew() expects a DOM parent node.");
  }

  const document = parent.nodeType === 9
    ? parent as Document
    : parent.ownerDocument;

  if (!document || document.nodeType !== 9) {
    throw new TypeError("[vynn]: mountRenderNew() could not resolve the parent's owner document.");
  }

  const before = options.before ?? null;
  if (before !== null && before.parentNode !== parent) {
    throw new TypeError("[vynn]: The before node must be a child of the mount parent.");
  }

  const adapter = createDOMTemplateAdapter(document);
  if (isRenderNewComponent(program)) {
    return mountRenderNewComponent(parent, program, adapter, before);
  }

  return mountTemplateProgram(parent, program, adapter, before);
}
