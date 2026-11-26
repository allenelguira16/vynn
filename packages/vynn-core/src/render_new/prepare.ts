import {
  isRenderNewComponent,
  prepareRenderNewComponent,
  resolveRenderNewComponentProgram,
  updateRenderNewComponentProps,
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
  readonly containsPreparedComponent: boolean;
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
function syncPreparedComponentProps(previous: unknown, next: unknown): boolean {
  if (isRenderNewComponent(previous) && isRenderNewComponent(next)) {
    updateRenderNewComponentProps(previous, next);
    return true;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    const nextByKey = new Map<unknown, RenderNewComponent>();
    for (const item of next) {
      if (
        isRenderNewComponent(item) &&
        Object.prototype.hasOwnProperty.call(item, "key")
      ) {
        nextByKey.set(item.key, item);
      }
    }

    for (const item of previous) {
      if (
        !isRenderNewComponent(item) ||
        !Object.prototype.hasOwnProperty.call(item, "key")
      ) continue;
      const updated = nextByKey.get(item.key);
      if (updated) updateRenderNewComponentProps(item, updated);
    }
    return true;
  }

  if (isTemplateProgram(previous) && isTemplateProgram(next)) {
    // A compatible prepared program keeps its original readers. Those readers
    // close over the component's state-backed props and remain reactive after
    // the component descriptor's props have been synchronized above.
    return previous.template === next.template;
  }

  return false;
}
function containsPreparedComponent(value: unknown): boolean {
  if (isRenderNewComponent(value)) return preparedComponents.has(value);
  if (Array.isArray(value)) return value.some(containsPreparedComponent);

  if (isTemplateProgram(value)) {
    return value.bindings.some((instruction) =>
      instruction.kind === "child" &&
      preparedChildValues.get(instruction.read)?.containsPreparedComponent === true,
    );
  }

  return false;
}

/**
 * Re-evaluates the accessor once to establish reactive dependencies, then
 * returns the prepared descriptor tree so the first mount does not run a
 * component body twice.
 */
export function consumePreparedRenderNewChildValue(
  read: () => unknown,
  trackDependencies = true,
): unknown {
  const prepared = preparedChildValues.get(read);
  if (!prepared) return read();

  preparedChildValues.delete(read);
  if (!trackDependencies) return prepared.value;

  const current = read();
  if (!prepared.containsPreparedComponent) return current;

  return syncPreparedComponentProps(prepared.value, current)
    ? prepared.value
    : current;
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
      await prepareValue(item, parentScope, visited, components, readers);
    }
    return;
  }

  if (isRenderNewComponent(value)) {
    if (visited.has(value) || preparedComponents.has(value)) return;
    visited.add(value);

    const scope = createScope(parentScope);
    try {
      const skipChildren = await runWithScope(
        scope,
        () => prepareRenderNewComponent(value),
      );
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
      await prepareValue(child, parentScope, visited, components, readers);
      const hasPreparedComponent = containsPreparedComponent(child);
      preparedChildValues.set(instruction.read, {
        value: child,
        containsPreparedComponent: hasPreparedComponent,
      });
      readers.push(instruction.read);
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
