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

function isDocumentRootProgram(program: DOMTemplateProgram): boolean {
  return program.template.namespace === "html" &&
    /^<html(?:\\s|>)/i.test(program.template.markup.trim());
}

function mountDocumentProgram(
  document: Document,
  program: DOMTemplateProgram,
  adapter: DOMTemplateAdapter,
): MountedTemplateProgram {
  if (!isDocumentRootProgram(program)) {
    throw new TypeError(
      "[vynn]: Mounting into a Document requires one complete <html> root program.",
    );
  }

  const staging = document.createDocumentFragment();
  const mounted = mountTemplateProgram(staging, program, adapter);
  const roots = mounted.instance.roots;

  if (
    roots.length !== 1 ||
    roots[0]?.nodeType !== 1 ||
    (roots[0] as Element).localName !== "html"
  ) {
    try {
      mounted.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [new TypeError("[vynn]: A document template must instantiate exactly one <html> element."), cleanupError],
        "[vynn]: The invalid document template could not be disposed.",
      );
    }
    throw new TypeError("[vynn]: A document template must instantiate exactly one <html> element.");
  }

  try {
    const current = document.documentElement;
    if (current) document.replaceChild(roots[0]!, current);
    else document.appendChild(roots[0]!);
  } catch (error) {
    try {
      mounted.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[vynn]: The document root could not be mounted or rolled back.",
      );
    }
    throw error;
  }

  return mounted;
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

  if (parent.nodeType === 9) {
    if (before !== null) {
      throw new TypeError("[vynn]: A full-document mount cannot use a before node.");
    }
    return mountDocumentProgram(parent as Document, program, adapter);
  }

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
