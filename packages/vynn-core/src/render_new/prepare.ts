import {
  isRenderNewComponent,
  prepareRenderNewComponent,
  resolveRenderNewComponentProgram,
  type RenderNewComponent,
} from "./component";
import { createScope, disposeScope, runWithScope } from "./lifecycle/scope";
import type { DOMTemplateProgram } from "./dom/program";
import type { RenderScope } from "./types";

function isTemplateProgram(value: unknown): value is DOMTemplateProgram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DOMTemplateProgram>;
  return !!candidate.template &&
    typeof candidate.template === "object" &&
    Array.isArray(candidate.bindings);
}

async function prepareValue(
  value: unknown,
  parentScope: RenderScope,
  visited: WeakSet<object>,
): Promise<void> {
  if (value === null || value === undefined || typeof value === "boolean") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      await prepareValue(item, parentScope, visited);
    }
    return;
  }

  if (isRenderNewComponent(value)) {
    if (visited.has(value)) return;
    visited.add(value);

    if (await prepareRenderNewComponent(value)) return;

    const scope = createScope(parentScope);
    try {
      const program = runWithScope(scope, () =>
        resolveRenderNewComponentProgram(value.render()),
      );
      await prepareValue(program, scope, visited);
    } finally {
      disposeScope(scope);
    }
    return;
  }

  if (isTemplateProgram(value)) {
    for (const instruction of value.bindings) {
      if (instruction.kind !== "child") continue;

      const child = runWithScope(parentScope, () => instruction.read());
      await prepareValue(child, parentScope, visited);
    }
  }
}

/**
 * Runs asynchronous preparation hooks in a render_new tree before client
 * hydration or server serialization.
 *
 * Components without a preparation hook are evaluated in temporary scopes
 * so nested deferred components can be discovered. Those scopes are disposed
 * after preparation; the actual mount or serialization creates the real
 * component lifetimes.
 */
export async function prepareRenderNewTree(
  program: DOMTemplateProgram | RenderNewComponent,
): Promise<void> {
  const scope = createScope(null);
  try {
    await prepareValue(program, scope, new WeakSet<object>());
  } finally {
    disposeScope(scope);
  }
}
