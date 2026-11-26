import {
  createScope,
  disposeScope,
  onScopeDispose,
  runWithScope,
} from "../lifecycle/scope";
import { insertDOMNodes } from "./insert";
import { removeDOMNodes } from "./remove";
import type { RenderScope } from "../types";
import type { TemplateFactory, TemplateInstance } from "../template/types";

/**
 * Runs inside the new template's scope after roots have been inserted, so
 * dynamic child bindings can resolve their parent and mount into live ranges.
 */
export type TemplateInitializer<TNode extends Node> = (
  instance: TemplateInstance<TNode>,
  scope: RenderScope,
) => void;

/**
 * A template instance connected to the DOM and owned by a render scope.
 *
 * mounted describes this mount operation's lifetime. It becomes false when
 * the returned instance is disposed or when an owning parent scope is
 * disposed. External DOM manipulation does not change this lifecycle flag.
 */
export interface MountedTemplate<TNode extends Node = Node> {
  readonly instance: TemplateInstance<TNode>;
  readonly scope: RenderScope;
  readonly mounted: boolean;
  dispose(): void;
}

function assertFactory<TNode extends Node>(
  factory: TemplateFactory<TNode>,
): void {
  if (
    !factory ||
    typeof factory !== "object" ||
    typeof factory.instantiate !== "function"
  ) {
    throw new TypeError("[vynn]: mountTemplate() expects a template factory.");
  }
}

function throwMountFailure(
  error: unknown,
  cleanupErrors: readonly unknown[],
): never {
  if (cleanupErrors.length === 0) throw error;

  throw new AggregateError(
    [error, ...cleanupErrors],
    "[vynn]: Template mounting failed and its scope could not be fully cleaned up.",
  );
}

/**
 * Instantiates and mounts a compiled template into a DOM parent.
 *
 * The operation is transactional:
 * - The factory is instantiated with the new render scope active.
 * - Roots are inserted in their compiler-defined order.
 * - An optional initializer installs bindings synchronously while anchors are attached.
 * - A scope cleanup owns root removal after binding cleanups have been registered.
 * - Any failure disposes the scope, removes partial roots, and rethrows.
 *
 * When called inside another render scope, the mounted template becomes its
 * child and is automatically disposed with that parent.
 */
export function mountTemplate<TNode extends Node>(
  parent: Node,
  factory: TemplateFactory<TNode>,
  before: Node | null = null,
  initialize?: TemplateInitializer<TNode>,
  removeRootsOnDispose = true,
): MountedTemplate<TNode> {
  assertFactory(factory);

  if (initialize !== undefined && typeof initialize !== "function") {
    throw new TypeError("[vynn]: mountTemplate() expects an initializer function.");
  }

  const scope = createScope();
  let instance: TemplateInstance<TNode> | undefined;
  let mounted = false;

  try {
    instance = runWithScope(scope, () => {
      const created = factory.instantiate();

      if (
        !created ||
        typeof created !== "object" ||
        !Array.isArray(created.roots) ||
        !created.references ||
        typeof created.references.get !== "function"
      ) {
        throw new TypeError("[vynn]: A template factory returned an invalid template instance.");
      }

      // Keep the instance reference outside the callback so the catch path
      // can remove roots even if insertion or initialization fails midway.
      instance = created;

      // Child bindings need an attached parent during their synchronous first
      // evaluation. Insertion is still synchronous, so no paint can observe an
      // uninitialized template before the initializer finishes.
      insertDOMNodes(parent, created.roots, before);
      mounted = true;

      // Register root cleanup after initialization. Binding/effect cleanup is
      // therefore attempted before the roots are removed during disposal.
      initialize?.(created, scope);
      onScopeDispose(() => {
        try {
          if (removeRootsOnDispose) removeDOMNodes(created.roots);
        } finally {
          mounted = false;
        }
      });

      return created;
    });

    const result: MountedTemplate<TNode> = {
      instance,
      scope,
      get mounted() {
        return mounted;
      },
      dispose() {
        disposeScope(scope);
      },
    };

    return Object.freeze(result);
  } catch (error) {
    const cleanupErrors: unknown[] = [];

    try {
      disposeScope(scope);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }

    // Defensive cleanup in case a malformed factory returned roots but
    // registering the scope cleanup or disposing the owner failed.
    if (instance) {
      try {
        removeDOMNodes(instance.roots);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }

    throwMountFailure(error, cleanupErrors);
  }
}
