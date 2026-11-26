import { $renderEffect } from "../../reactivity/effect";
import type { Accessor, Disposable, RenderScope } from "../types";
import { runWithScope } from "../lifecycle/scope";

/** A text-node binding whose reactive effect belongs to a render scope. */
export interface TextBinding extends Disposable {
  readonly node: Text;
}

function assertTextNode(node: Text): void {
  if (
    !node ||
    typeof node !== "object" ||
    node.nodeType !== 3 ||
    typeof node.data !== "string"
  ) {
    throw new TypeError("[vynn]: bindText() expects a DOM Text node.");
  }
}

function toTextContent(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Binds a text node to a reactive accessor.
 *
 * The initial value is written synchronously. Subsequent reads are tracked by
 * Vynn's render-priority effect, so updates run after derived computations and
 * before ordinary effects. The effect is owned by the supplied render scope.
 *
 * null and undefined render as empty text; other values use String(value).
 * The node is updated only when its text data actually changes.
 */
export function bindText(
  scope: RenderScope,
  node: Text,
  read: Accessor<unknown>,
): TextBinding {
  assertTextNode(node);

  if (typeof read !== "function") {
    throw new TypeError("[vynn]: bindText() expects a value accessor.");
  }

  const stop = runWithScope(scope, () =>
    $renderEffect(() => {
      const next = toTextContent(read());

      if (node.data !== next) {
        node.data = next;
      }
    }),
  );

  return Object.freeze({
    node,
    dispose: stop,
  });
}
