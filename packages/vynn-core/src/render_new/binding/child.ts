import { $renderEffect } from "../../reactivity/effect";
import { runWithScope } from "../lifecycle/scope";
import type { Accessor, Disposable, RenderScope } from "../types";
import type { DOMTemplateAdapter } from "../dom/adapter";
import { mountTemplateProgram, type DOMTemplateProgram } from "../dom/program";

export interface ChildBinding extends Disposable {
  readonly anchor: Comment;
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

/**
 * Inserts dynamic render values at a compiler-emitted comment anchor.
 *
 * Supported values are nullish/boolean values, strings, numbers, bigint,
 * DOM Nodes, nested arrays, and DOMTemplatePrograms returned by components.
 * Components are evaluated by the compiler-generated accessor; their returned
 * programs receive child render scopes and are disposed when the value changes.
 */
export function bindChild(
  scope: RenderScope,
  anchor: Comment,
  adapter: DOMTemplateAdapter,
  read: Accessor<unknown>,
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

  const stop = runWithScope(scope, () =>
    $renderEffect(() => {
      const parent = anchor.parentNode;
      if (!parent) {
        throw new Error("[vynn]: A dynamic child anchor must belong to a parent node.");
      }

      const cleanups: Array<() => void> = [];

      const append = (value: unknown): void => {
        if (value === null || value === undefined || typeof value === "boolean") return;

        if (Array.isArray(value)) {
          for (const item of value) append(item);
          return;
        }

        if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
          const text = anchor.ownerDocument!.createTextNode(String(value));
          parent.insertBefore(text, anchor);
          cleanups.push(() => removeNodes([text]));
          return;
        }

        if (isTemplateProgram(value)) {
          const mounted = mountTemplateProgram(parent, value, adapter, anchor);
          cleanups.push(() => mounted.dispose());
          return;
        }

        if (isDOMNode(value)) {
          if (value.nodeType === 11) {
            const nodes = Array.from(value.childNodes);
            parent.insertBefore(value, anchor);
            cleanups.push(() => removeNodes(nodes));
          } else {
            parent.insertBefore(value, anchor);
            cleanups.push(() => removeNodes([value]));
          }
          return;
        }

        throw new TypeError(
          "[vynn]: Dynamic children must be renderable primitives, DOM Nodes, arrays, or component template programs.",
        );
      };

      try {
        append(read());
      } catch (error) {
        for (const cleanup of cleanups.reverse()) cleanup();
        throw error;
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
