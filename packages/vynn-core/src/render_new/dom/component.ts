import { createScope, disposeScope, runWithScope } from "../lifecycle/scope";
import { consumePreparedRenderNewComponent } from "../prepare";
import type { RenderNewComponent } from "../component";
import {
  isRenderNewComponent,
  resolveRenderNewComponentProgram,
  updateRenderNewComponentProps,
} from "../component";
import type { DOMTemplateAdapter } from "./adapter";
import type { DOMTemplateProgram } from "./program";
import { mountTemplateProgram } from "./program";
import {
  hydrateTemplateProgram,
  hydrateTemplateProgramInRange,
} from "./hydrate";
import type { MountedTemplate } from "./mount";

export interface MountedRenderNewComponent extends MountedTemplate<Node> {
  /** Updates reactive props while retaining the component scope. */
  update(component: RenderNewComponent): boolean;
}

export interface HydrationRange {
  readonly start: Comment;
  readonly end: Comment;
}

function wrapComponentMount(
  scope: ReturnType<typeof createScope>,
  mounted: MountedTemplate<Node>,
  component: RenderNewComponent,
): MountedRenderNewComponent {
  return Object.freeze({
    instance: mounted.instance,
    scope,
    get mounted() {
      return scope.state === "active" && mounted.mounted;
    },
    dispose() {
      disposeScope(scope);
    },
    update(next: RenderNewComponent) {
      if (scope.state !== "active") return false;
      return updateRenderNewComponentProps(component, next);
    },
  });
}

function disposeAfterFailure(scope: ReturnType<typeof createScope>, error: unknown): never {
  try {
    disposeScope(scope);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      "[vynn render_new]: Component rendering failed and its scope could not be disposed.",
    );
  }
  throw error;
}

function assertComponent(value: RenderNewComponent): void {
  if (!isRenderNewComponent(value)) {
    throw new TypeError("[vynn render_new]: Expected a deferred component descriptor.");
  }
}

function clearHydrationRange(range: HydrationRange): void {
  let current = range.start.nextSibling;
  while (current && current !== range.end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

/**
 * Evaluates and mounts a deferred component inside its own render scope.
 * The component scope owns the resulting template scope and all state/effects
 * created while evaluating the component body.
 */
export function mountRenderNewComponent(
  parent: Node,
  component: RenderNewComponent,
  adapter: DOMTemplateAdapter,
  before: Node | null = null,
  hydrationRange?: HydrationRange,
): MountedRenderNewComponent {
  assertComponent(component);
  const prepared = consumePreparedRenderNewComponent(component);
  const scope = prepared?.scope ?? createScope();

  try {
    let mounted: MountedTemplate<Node>;

    if (prepared) {
      mounted = runWithScope(scope, () => {
        if (hydrationRange) {
          const adopted = hydrateTemplateProgramInRange(
            hydrationRange.start,
            hydrationRange.end,
            prepared.program,
            adapter,
          );
          if (adopted) return adopted;
          clearHydrationRange(hydrationRange);
        }

        return mountTemplateProgram(parent, prepared.program, adapter, before);
      });
    } else {
      mounted = runWithScope(scope, () => {
        const program = resolveRenderNewComponentProgram(component.render());

        if (hydrationRange) {
          const adopted = hydrateTemplateProgramInRange(
            hydrationRange.start,
            hydrationRange.end,
            program,
            adapter,
          );
          if (adopted) return adopted;
          clearHydrationRange(hydrationRange);
        }

        return mountTemplateProgram(parent, program, adapter, before);
      });
    }

    return wrapComponentMount(scope, mounted, component);
  } catch (error) {
    return disposeAfterFailure(scope, error);
  }
}

/**
 * Hydrates or mounts a deferred component against the parent's contents.
 * Component evaluation and its descendant template both belong to the same
 * component scope, so all resources are disposed with the returned handle.
 */
export function hydrateRenderNewComponent(
  parent: Node,
  component: RenderNewComponent,
  adapter: DOMTemplateAdapter,
): MountedRenderNewComponent {
  assertComponent(component);
  const prepared = consumePreparedRenderNewComponent(component);
  const scope = prepared?.scope ?? createScope();

  try {
    const mounted = runWithScope(scope, () => {
      const program = prepared?.program ??
        resolveRenderNewComponentProgram(component.render());
      return hydrateTemplateProgram(parent, program, adapter);
    });

    return wrapComponentMount(scope, mounted, component);
  } catch (error) {
    return disposeAfterFailure(scope, error);
  }
}

