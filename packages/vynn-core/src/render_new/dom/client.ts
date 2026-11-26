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
  const preparedRoot = consumePreparedRenderNewRootScope(program);

  const mount = () => isRenderNewComponent(program)
    ? mountRenderNewComponent(parent, program, adapter, before)
    : mountTemplateProgram(parent, program, adapter, before);

  let mounted: MountedTemplate<Node>;
  try {
    mounted = preparedRoot ? runWithScope(preparedRoot, mount) : mount();
  } catch (error) {
    if (preparedRoot) disposeScope(preparedRoot);
    throw error;
  }

  if (!preparedRoot) return mounted;

  return Object.freeze({
    instance: mounted.instance,
    scope: mounted.scope,
    get mounted() {
      return mounted.mounted && preparedRoot.state === "active";
    },
    dispose() {
      try {
        mounted.dispose();
      } finally {
        disposeScope(preparedRoot);
      }
    },
  });
}
