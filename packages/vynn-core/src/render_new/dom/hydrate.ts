import type { DOMTemplateProgram } from "./program";
import type { DOMTemplateAdapter } from "./adapter";
import { createTemplateFactory } from "../template/factory";
import type { TemplateInstance } from "../template/types";
import { applyTemplateBindings } from "../binding/instructions";
import { createScope, disposeScope, onScopeDispose, runWithScope } from "../lifecycle/scope";
import { removeDOMNodes } from "./remove";
import type { MountedTemplate } from "./mount";
import { mountTemplateProgram } from "./program";

class HydrationMismatch extends Error {
  constructor() {
    super("The server-rendered DOM does not match the render_new template.");
    this.name = "HydrationMismatch";
  }
}

function getChildRangeEnd(start: Node, nodes: readonly Node[], startIndex: number): number {
  if (start.nodeType !== 8) return startIndex;

  const data = (start as Comment).data;
  const match = /^__vynn_render_new_child_(\d+)_start__$/.exec(data);
  if (!match) return startIndex;

  const expectedEnd = "__vynn_render_new_child_" + match[1] + "_end__";
  let nestedRanges = 0;

  for (let index = startIndex + 1; index < nodes.length; index++) {
    const candidate = nodes[index]!;
    if (candidate.nodeType !== 8) continue;

    const comment = (candidate as Comment).data;
    if (/^__vynn_render_new_child_\d+_start__$/.test(comment)) {
      nestedRanges++;
      continue;
    }

    if (comment === expectedEnd) {
      if (nestedRanges === 0) return index;
      nestedRanges--;
    }
  }

  throw new HydrationMismatch();
}

function assertElementMatch(expected: Element, actual: Node): asserts actual is Element {
  if (
    actual.nodeType !== 1 ||
    (actual as Element).localName !== expected.localName ||
    (actual as Element).namespaceURI !== expected.namespaceURI
  ) {
    throw new HydrationMismatch();
  }

  const actualElement = actual as Element;
  for (const attribute of Array.from(expected.attributes)) {
    if (actualElement.getAttribute(attribute.name) !== attribute.value) {
      throw new HydrationMismatch();
    }
  }
}

function matchNode(
  expected: Node,
  actual: Node,
  mapping: WeakMap<Node, Node>,
): void {
  if (expected.nodeType !== actual.nodeType) throw new HydrationMismatch();
  mapping.set(expected, actual);

  if (expected.nodeType === 1) {
    assertElementMatch(expected as Element, actual);
    matchSequence(
      Array.from(expected.childNodes),
      Array.from(actual.childNodes),
      mapping,
    );
    return;
  }

  if (expected.nodeType === 3) {
    if ((expected as Text).data !== (actual as Text).data) {
      throw new HydrationMismatch();
    }
    return;
  }

  if (expected.nodeType === 8) {
    if ((expected as Comment).data !== (actual as Comment).data) {
      throw new HydrationMismatch();
    }
    return;
  }

  throw new HydrationMismatch();
}

function matchSequence(
  expectedNodes: readonly Node[],
  actualNodes: readonly Node[],
  mapping: WeakMap<Node, Node>,
): void {
  let expectedIndex = 0;
  let actualIndex = 0;

  while (expectedIndex < expectedNodes.length) {
    const expected = expectedNodes[expectedIndex]!;
    const actual = actualNodes[actualIndex];

    if (!actual) throw new HydrationMismatch();

    if (expected.nodeType === 8) {
      const marker = /^__vynn_render_new_child_\d+_start__$/.test(
        (expected as Comment).data,
      );

      if (marker) {
        const expectedEndIndex = getChildRangeEnd(
          expected,
          expectedNodes,
          expectedIndex,
        );
        const expectedEnd = expectedNodes[expectedEndIndex]!;
        if (
          actual.nodeType !== 8 ||
          (actual as Comment).data !== (expected as Comment).data
        ) {
          throw new HydrationMismatch();
        }

        const actualEndIndex = getChildRangeEnd(actual, actualNodes, actualIndex);
        const actualEnd = actualNodes[actualEndIndex]!;
        if (
          actualEnd.nodeType !== 8 ||
          (actualEnd as Comment).data !== (expectedEnd as Comment).data
        ) {
          throw new HydrationMismatch();
        }

        mapping.set(expected, actual);
        mapping.set(expectedEnd, actualEnd);
        expectedIndex = expectedEndIndex + 1;
        actualIndex = actualEndIndex + 1;
        continue;
      }
    }

    matchNode(expected, actual, mapping);
    expectedIndex++;
    actualIndex++;
  }

  if (actualIndex !== actualNodes.length) throw new HydrationMismatch();
}

function createHydratedInstance(
  program: DOMTemplateProgram,
  actualRoots: readonly Node[],
  adapter: DOMTemplateAdapter,
): TemplateInstance<Node> {
  const factory = createTemplateFactory(program.template, adapter);
  const expected = factory.instantiate();
  const mapping = new WeakMap<Node, Node>();

  const expectedRootNodes = expected.roots;
  matchSequence(expectedRootNodes, actualRoots, mapping);

  const references = new Map<number, Node>();
  for (const [id, expectedNode] of expected.references) {
    const actualNode = mapping.get(expectedNode);
    if (!actualNode) throw new HydrationMismatch();
    references.set(id, actualNode);
  }

  return Object.freeze({
    roots: Object.freeze([...actualRoots]),
    references,
  });
}

function createHydratedMount(
  program: DOMTemplateProgram,
  instance: TemplateInstance<Node>,
  adapter: DOMTemplateAdapter,
): MountedTemplate<Node> {
  const scope = createScope();
  let mounted = true;

  try {
    runWithScope(scope, () => {
      applyTemplateBindings(scope, instance, program.bindings, adapter, { hydrate: true });
      onScopeDispose(() => {
        try {
          removeDOMNodes(instance.roots);
        } finally {
          mounted = false;
        }
      });
    });
  } catch (error) {
    try {
      disposeScope(scope);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[vynn render_new]: Hydration failed and its scope could not be disposed.",
      );
    }
    throw error;
  }

  return Object.freeze({
    instance,
    scope,
    get mounted() {
      return mounted;
    },
    dispose() {
      disposeScope(scope);
    },
  });
}

/**
 * Hydrates an existing dynamic-child range. A null return means the existing
 * nodes do not match the nested component program and should be replaced.
 * The caller owns the start/end comment markers; this mount owns only nodes
 * between them.
 */
export function hydrateTemplateProgramInRange(
  start: Comment,
  end: Comment,
  program: DOMTemplateProgram,
  adapter: DOMTemplateAdapter,
): MountedTemplate<Node> | null {
  if (
    !start ||
    !end ||
    start.nodeType !== 8 ||
    end.nodeType !== 8 ||
    start.parentNode === null ||
    start.parentNode !== end.parentNode
  ) {
    return null;
  }

  const roots: Node[] = [];
  let current = start.nextSibling;
  while (current && current !== end) {
    roots.push(current);
    current = current.nextSibling;
  }
  if (current !== end) return null;

  try {
    const instance = createHydratedInstance(program, roots, adapter);
    return createHydratedMount(program, instance, adapter);
  } catch (error) {
    if (error instanceof HydrationMismatch) return null;
    throw error;
  }
}

/**
 * Hydrates one render_new program against the parent's complete child list.
 * If the static node structure does not match, the old contents are replaced
 * with a fresh client mount instead of leaving a partially bound tree.
 */
export function hydrateTemplateProgram(
  parent: Node,
  program: DOMTemplateProgram,
  adapter: DOMTemplateAdapter,
): MountedTemplate<Node> {
  if (!parent || typeof parent !== "object" || !parent.childNodes) {
    throw new TypeError("[vynn render_new]: Hydration expects a DOM parent node.");
  }

  const roots = Array.from(parent.childNodes);
  try {
    const instance = createHydratedInstance(program, roots, adapter);
    return createHydratedMount(program, instance, adapter);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) throw error;
  }

  removeDOMNodes(roots);
  return mountTemplateProgram(parent, program, adapter);
}
