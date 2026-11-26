import { applyTemplateBindings, type TemplateBindingInstruction } from "../binding/instructions";
import { createTemplateFactory } from "../template/factory";
import type { DOMTemplateAdapter } from "./adapter";
import type { TemplateDefinition } from "../template/types";
import { mountTemplate, type MountedTemplate } from "./mount";

/**
 * Compiler output consumed by the render_new DOM mount path.
 *
 * `template` contains only static markup and numeric node references.
 * `bindings` contains reactive operations whose accessors close over the
 * component's current props/state. It is intentionally unrelated to the
 * legacy vynn/render helper protocol.
 */
export type DOMTemplateKey = string | number | bigint;

export interface DOMTemplateProgram {
  readonly template: TemplateDefinition;
  readonly bindings: readonly TemplateBindingInstruction[];
  /** Optional stable identity for a program returned from an array child expression. */
  readonly key?: DOMTemplateKey;
}

export interface MountedTemplateProgram extends MountedTemplate<Node> {
  /** Update reactive accessors without replacing compatible DOM nodes. */
  update(program: DOMTemplateProgram): void;
}

function assertProgram(program: DOMTemplateProgram): void {
  if (!program || typeof program !== "object") {
    throw new TypeError("[vynn]: mountTemplateProgram() expects a template program.");
  }

  if (!program.template || typeof program.template !== "object") {
    throw new TypeError("[vynn]: A DOM template program must contain a template definition.");
  }

  if (!Array.isArray(program.bindings)) {
    throw new TypeError("[vynn]: A DOM template program must contain a binding instruction array.");
  }
}

/**
 * Instantiates and mounts compiler output using the new renderer.
 *
 * All static nodes are cloned from the reusable template factory. Numeric
 * reference IDs are resolved against that clone, then the binding instruction
 * list is applied inside the new render scope before roots are inserted into
 * the parent. The mount operation remains transactional: invalid instructions
 * dispose the scope and leave no partially mounted roots.
 */
export function mountTemplateProgram(
  parent: Node,
  program: DOMTemplateProgram,
  adapter: DOMTemplateAdapter,
  before: Node | null = null,
): MountedTemplateProgram {
  assertProgram(program);

  // Snapshot the instruction list for this mount. Instructions retain their
  // accessor closures, but a caller cannot append or remove operations while
  // a mount is being initialized.
  const instructions = Object.freeze([...program.bindings]);
  const factory = createTemplateFactory(program.template, adapter);

  let bindings: ReturnType<typeof applyTemplateBindings> | undefined;
  const mounted = mountTemplate(
    parent,
    factory,
    before,
    (instance, scope) => {
      bindings = applyTemplateBindings(scope, instance, instructions, adapter);
    },
  );

  return Object.freeze({
    instance: mounted.instance,
    scope: mounted.scope,
    get mounted() {
      return mounted.mounted;
    },
    dispose() {
      mounted.dispose();
    },
    update(next: DOMTemplateProgram) {
      assertProgram(next);
      if (next.template !== program.template) {
        throw new TypeError(
          "[vynn]: A mounted template program can only update from the same static template definition.",
        );
      }
      bindings?.update(next.bindings);
    },
  });
}
