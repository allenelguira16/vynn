import {
  isRenderNewComponent,
  prepareRenderNewComponent,
  resolveRenderNewComponentProgram,
  type RenderNewComponent,
} from "./component";
import { createScope, disposeScope, runWithScope } from "./lifecycle/scope";
import type { DOMTemplateProgram } from "./dom/program";
import type { RenderScope } from "./types";

interface PreparedComponent {
  readonly scope: RenderScope;
  readonly program: DOMTemplateProgram;
}

interface PreparedChildValue {
  readonly value: unknown;
}

const preparedComponents = new WeakMap<RenderNewComponent, PreparedComponent>();
const preparedChildValues = new WeakMap<() => unknown, PreparedChildValue>();
const preparedRootScopes = new WeakMap<object, RenderScope>();

function isTemplateProgram(value: unknown): value is DOMTemplateProgram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DOMTemplateProgram>;
  return !!candidate.template &&
    typeof candidate.template === "object" &&
    Array.isArray(candidate.bindings);
}

/** Consumes a component's prepared scope and template program, when available. */
export function consumePreparedRenderNewComponent(
  component: RenderNewComponent,
): PreparedComponent | undefined {
  const prepared = preparedComponents.get(component);
  if (prepared) preparedComponents.delete(component);
  return prepared;
}

/**
 * Reads a child binding's cached first value. The cache is one-shot so future
 * reactive updates continue to evaluate the original accessor.
 */
export function consumePreparedRenderNewChildValue(
  read: () => unknown,
): unknown {
  const prepared = preparedChildValues.get(read);
  if (!prepared) return read();
  preparedChildValues.delete(read);
  return prepared.value;
}

/** Consumes the temporary root scope created by prepareRenderNewTree(). */
export function consumePreparedRenderNewRootScope(
  program: DOMTemplateProgram | RenderNewComponent,
): RenderScope | undefined {
  const prepared = preparedRootScopes.get(program);
  if (prepared) preparedRootScopes.delete(program);
  return prepared;
}

async function prepareValue(
  value: unknown,
  parentScope: RenderScope,
  visited: WeakSet<object>,
  components: RenderNewComponent[],
  readers: Array<() => unknown>,
): Promise<void> {
  if (value === null || value === undefined || typeof value === "boolean") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      await prepareValue(item, parentScope, visited);
    }
    return;
  }

  if (isRenderNewComponent(value)) {
    if (visited.has(value) || preparedComponents.has(value)) return;
    visited.add(value);

    const scope = createScope(parentScope);
    try {
      const skipChildren = await prepareRenderNewComponent(value);
      const program = runWithScope(scope, () =>
        resolveRenderNewComponentProgram(value.render()),
      );
      preparedComponents.set(value, { scope, program });
      components.push(value);

      if (!skipChildren) {
        await prepareValue(program, scope, visited, components, readers);
      }
    } catch (error) {
      disposeScope(scope);
      throw error;
    }
    return;
  }

  if (isTemplateProgram(value)) {
    for (const instruction of value.bindings) {
      if (instruction.kind !== "child") continue;

      const child = runWithScope(parentScope, () => instruction.read());
      preparedChildValues.set(instruction.read, { value: child });
      readers.push(instruction.read);
      await prepareValue(child, parentScope, visited, components, readers);
    }
  }
}

/**
 * Prepares a render_new tree once before mounting, hydration, or SSR.
 *
 * Component render callbacks are evaluated exactly once during preparation.
 * Their scopes, template programs, and initial dynamic-child values are kept
 * alive and consumed by the subsequent renderer operation. This avoids
 * duplicate component side effects and preserves request-local router state.
 */
export async function prepareRenderNewTree(
  program: DOMTemplateProgram | RenderNewComponent,
): Promise<void> {
  if (preparedRootScopes.has(program)) {
    throw new Error("[vynn render_new]: This render tree has already been prepared.");
  }

  const rootScope = createScope(null);
  const components: RenderNewComponent[] = [];
  const readers: Array<() => unknown> = [];
  try {
    await prepareValue(
      program,
      rootScope,
      new WeakSet<object>(),
      components,
      readers,
    );
    preparedRootScopes.set(program, rootScope);
  } catch (error) {
    for (const component of components) preparedComponents.delete(component);
    for (const read of readers) preparedChildValues.delete(read);
    disposeScope(rootScope);
    throw error;
  }
}
