import { $renderEffect } from "../../reactivity/effect";
import { runWithScope } from "../lifecycle/scope";
import type { Accessor, Disposable, RenderScope } from "../types";
import type { DOMTemplateAdapter } from "../dom/adapter";
import { mountTemplateProgram, type DOMTemplateProgram } from "../dom/program";
import { hydrateTemplateProgramInRange } from "../dom/hydrate";

export interface ChildBinding extends Disposable {
  readonly anchor: Comment;
}

export interface ChildBindingOptions {
  /** Reuse compatible server-rendered content on the first evaluation. */
  readonly hydrate?: boolean;
}

function isTemplateProgram(value: unknown): value is DOMTemplateProgram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DOMTemplateProgram>;
  return !!candidate.template && typeof candidate.template === "object" &&
    Array.isArray(candidate.bindings);
}

function isDOMNode(value: unknown): value is Node {
  return !!value && typeof value === "object" &&
    typeof (value as Node).nodeType === "number" &&
    typeof (value as Node).cloneNode === "function";
}

function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
}

function findEndAnchor(start: Comment): Comment | null {
  const match = /^__vynn_render_new_child_(\d+)_start__$/.exec(start.data);
  if (!match) return null;

  const expectedEnd = "__vynn_render_new_child_" + match[1] + "_end__";
  let nestedRanges = 0;
  let current = start.nextSibling;

  while (current) {
    if (current.nodeType === 8) {
      const data = (current as Comment).data;
      if (/^__vynn_render_new_child_\d+_start__$/.test(data)) {
        nestedRanges++;
      } else if (data === expectedEnd) {
        if (nestedRanges === 0) return current as Comment;
        nestedRanges--;
      }
    }
    current = current.nextSibling;
  }

  throw new Error("[vynn]: A dynamic child anchor is missing its paired end marker.");
}

function getRangeNodes(start: Comment, end: Comment): Node[] {
  const nodes: Node[] = [];
  let current = start.nextSibling;
  while (current && current !== end) {
    nodes.push(current);
    current = current.nextSibling;
  }
  if (current !== end) {
    throw new Error("[vynn]: A dynamic child range is not properly ordered.");
  }
  return nodes;
}

function isPrimitive(value: unknown): value is string | number | bigint {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint";
}

function isPrimitiveArray(value: readonly unknown[]): boolean {
  return value.every((item) =>
    item === null || item === undefined || typeof item === "boolean" || isPrimitive(item),
  );
}

function primitiveText(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  return String(value);
}

function clearRange(start: Comment, end: Comment): void {
  removeNodes(getRangeNodes(start, end));
}

function appendNode(parent: Node, node: Node, before: Node): () => void {
  if (node.nodeType === 11 && !("host" in node)) {
    const children = Array.from(node.childNodes);
    parent.insertBefore(node, before);
    return () => removeNodes(children);
  }

  parent.insertBefore(node, before);
  return () => removeNodes([node]);
}

/**
 * Inserts dynamic render values between a compiler-emitted pair of comment
 * markers. Compatible server-rendered text and child programs are adopted on
 * the first hydrated evaluation; changed values are replaced inside the range.
 */
export function bindChild(
  scope: RenderScope,
  anchor: Comment,
  adapter: DOMTemplateAdapter,
  read: Accessor<unknown>,
  options: ChildBindingOptions = {},
): ChildBinding {
  if (!anchor || anchor.nodeType !== 8) {
    throw new TypeError("[vynn]: bindChild() expects a DOM comment anchor.");
  }
  if (!adapter || typeof adapter !== "object" || typeof adapter.parse !== "function") {
    throw new TypeError("[vynn]: bindChild() expects a DOM template adapter.");
  }
  if (typeof read !== "function") {
    throw new TypeError("[vynn]: bindChild() expects a value accessor.");
  }

  let firstEvaluation = true;
  const shouldHydrate = options.hydrate === true;

  const stop = runWithScope(scope, () =>
    $renderEffect(() => {
      const parent = anchor.parentNode;
      if (!parent) {
        throw new Error("[vynn]: A dynamic child anchor must belong to a parent node.");
      }

      const end = findEndAnchor(anchor);
      const before: Node = end ?? anchor;
      const cleanups: Array<() => void> = [];
      const hydrateThisRun = shouldHydrate && firstEvaluation && !!end;

      const append = (value: unknown, hydrate: boolean): void => {
        if (value === null || value === undefined || typeof value === "boolean") {
          if (hydrate && end) clearRange(anchor, end);
          return;
        }

        if (isPrimitive(value)) {
          const text = String(value);
          if (hydrate && end) {
            const existing = getRangeNodes(anchor, end);
            if (existing.length === 1 && existing[0]!.nodeType === 3) {
              const textNode = existing[0] as Text;
              textNode.data = text;
              cleanups.push(() => removeNodes([textNode]));
              return;
            }
            clearRange(anchor, end);
          }
          if (text.length > 0) {
            const textNode = anchor.ownerDocument!.createTextNode(text);
            parent.insertBefore(textNode, before);
            cleanups.push(() => removeNodes([textNode]));
          }
          return;
        }

        if (Array.isArray(value)) {
          if (hydrate && end && isPrimitiveArray(value)) {
            const text = value.map(primitiveText).join("");
            const existing = getRangeNodes(anchor, end);
            if (text.length === 0 && existing.length === 0) return;
            if (existing.length === 1 && existing[0]!.nodeType === 3) {
              const textNode = existing[0] as Text;
              textNode.data = text;
              cleanups.push(() => removeNodes([textNode]));
              return;
            }
            clearRange(anchor, end);
            if (text.length > 0) {
              const textNode = anchor.ownerDocument!.createTextNode(text);
              parent.insertBefore(textNode, before);
              cleanups.push(() => removeNodes([textNode]));
            }
            return;
          }

          if (hydrate && end) clearRange(anchor, end);
          for (const item of value) append(item, false);
          return;
        }

        if (isTemplateProgram(value)) {
          if (hydrate && end) {
            const adopted = hydrateTemplateProgramInRange(anchor, end, value, adapter);
            if (adopted) {
              cleanups.push(() => adopted.dispose());
              return;
            }
            clearRange(anchor, end);
          }
          const mounted = mountTemplateProgram(parent, value, adapter, before);
          cleanups.push(() => mounted.dispose());
          return;
        }

        if (isDOMNode(value)) {
          if (hydrate && end) clearRange(anchor, end);
          cleanups.push(appendNode(parent, value, before));
          return;
        }

        throw new TypeError(
          "[vynn]: Dynamic children must be renderable primitives, DOM Nodes, arrays, or component template programs.",
        );
      };

      try {
        append(read(), hydrateThisRun);
      } catch (error) {
        for (const cleanup of cleanups.reverse()) cleanup();
        throw error;
      } finally {
        firstEvaluation = false;
      }

      return () => {
        for (const cleanup of cleanups.reverse()) cleanup();
      };
    }),
  );

  return Object.freeze({
    anchor,
    dispose: stop,
  });
}
