import { cloneTemplateInstance, type TemplateNodeCloner } from "./clone";
import type { TemplateNodeResolver } from "./resolve";
import type {
  TemplateDefinition,
  TemplateFactory,
  TemplateInstance,
  TemplateNamespace,
  TemplateNodePath,
  TemplateReference,
} from "./types";

/**
 * Host operations required to turn a template definition into instances.
 *
 * A DOM host can parse HTML into a DocumentFragment and clone its child nodes.
 * An SSR host can parse the same definition into its own immutable blueprint
 * and clone that representation. The factory itself knows neither host.
 */
export interface TemplateAdapter<TBlueprint, TNode>
  extends TemplateNodeCloner<TBlueprint, TNode>, TemplateNodeResolver<TNode> {
  /** Parse static markup into a reusable host-specific blueprint. */
  parse(markup: string, namespace: TemplateNamespace): TBlueprint;

  /** Clone a blueprint into a fresh, ordered list of root nodes. */
  clone(blueprint: TBlueprint): readonly TNode[];

}

interface FactoryCacheEntry<TNode> {
  readonly signature: string;
  readonly factory: TemplateFactory<TNode>;
}

const factoryCache = new WeakMap<
  TemplateDefinition,
  WeakMap<object, FactoryCacheEntry<unknown>>
>();

function validatePath(path: TemplateNodePath, referenceID: number): void {
  if (path.length === 0) {
    throw new TypeError(
      "[vynn]: Template reference " + referenceID + " must have a non-empty node path.",
    );
  }

  for (let index = 0; index < path.length; index++) {
    const position = path[index];

    if (!Number.isSafeInteger(position) || position < 0) {
      throw new TypeError(
        "[vynn]: Template reference " +
          referenceID +
          " has an invalid path index at position " +
          index +
          ".",
      );
    }
  }
}

/**
 * Takes an immutable snapshot of the compiler definition.
 *
 * Runtime callers may construct definitions manually, so TypeScript readonly
 * annotations alone are not enough to protect a cached blueprint from later
 * mutation.
 */
function snapshotDefinition(definition: TemplateDefinition): TemplateDefinition {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("[vynn]: createTemplateFactory() expects a template definition.");
  }

  if (typeof definition.markup !== "string") {
    throw new TypeError("[vynn]: A template definition must contain string markup.");
  }

  if (
    definition.namespace !== "html" &&
    definition.namespace !== "svg" &&
    definition.namespace !== "mathml"
  ) {
    throw new TypeError("[vynn]: A template definition has an unsupported namespace.");
  }

  if (!Array.isArray(definition.references)) {
    throw new TypeError("[vynn]: A template definition must contain a reference array.");
  }

  const ids = new Set<number>();
  const references: TemplateReference[] = definition.references.map((reference) => {
    if (!reference || typeof reference !== "object") {
      throw new TypeError("[vynn]: A template reference must be an object.");
    }

    if (!Number.isSafeInteger(reference.id) || reference.id < 0) {
      throw new TypeError("[vynn]: Template reference IDs must be non-negative safe integers.");
    }

    if (ids.has(reference.id)) {
      throw new TypeError(
        "[vynn]: Duplicate template reference ID " + reference.id + ".",
      );
    }

    ids.add(reference.id);

    if (
      reference.kind !== "element" &&
      reference.kind !== "text" &&
      reference.kind !== "anchor"
    ) {
      throw new TypeError(
        "[vynn]: Template reference " + reference.id + " has an unsupported node kind.",
      );
    }

    if (!Array.isArray(reference.path)) {
      throw new TypeError(
        "[vynn]: Template reference " + reference.id + " must contain a node path.",
      );
    }

    validatePath(reference.path, reference.id);

    return Object.freeze({
      id: reference.id,
      kind: reference.kind,
      path: Object.freeze([...reference.path]),
    });
  });

  return Object.freeze({
    markup: definition.markup,
    namespace: definition.namespace,
    references: Object.freeze(references),
  });
}

function getDefinitionSignature(definition: TemplateDefinition): string {
  return JSON.stringify([
    definition.markup,
    definition.namespace,
    definition.references.map(({ id, kind, path }) => [id, kind, path]),
  ]);
}


function createFactory<TBlueprint, TNode>(
  definition: TemplateDefinition,
  adapter: TemplateAdapter<TBlueprint, TNode>,
): TemplateFactory<TNode> {
  const blueprint = adapter.parse(definition.markup, definition.namespace);

  const factory: TemplateFactory<TNode> = {
    definition,
    instantiate(): TemplateInstance<TNode> {
      const clonedRoots = adapter.clone(blueprint);

      if (!Array.isArray(clonedRoots)) {
        throw new TypeError("[vynn]: A template adapter must return an array of root nodes.");
      }

      return cloneTemplateInstance(
        blueprint,
        adapter,
        definition.references,
        adapter,
      );
    },
  };

  return Object.freeze(factory);
}

/**
 * Creates or retrieves a reusable template factory for a host adapter.
 *
 * The parsed blueprint is cached by definition identity and adapter identity.
 * Every call to instantiate() clones fresh roots and resolves references
 * against that clone, so instances never share mutable host nodes.
 *
 * Definitions are snapshotted and validated before parsing. If a caller
 * mutates a definition after a factory has been created, the next factory
 * request detects the changed contents and replaces that cache entry.
 */
export function createTemplateFactory<TBlueprint, TNode>(
  definition: TemplateDefinition,
  adapter: TemplateAdapter<TBlueprint, TNode>,
): TemplateFactory<TNode> {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("[vynn]: createTemplateFactory() expects a template adapter.");
  }

  if (
    typeof adapter.parse !== "function" ||
    typeof adapter.clone !== "function" ||
    typeof adapter.getChild !== "function" ||
    typeof adapter.getKind !== "function"
  ) {
    throw new TypeError("[vynn]: A template adapter is missing a required operation.");
  }

  const snapshot = snapshotDefinition(definition);
  const signature = getDefinitionSignature(snapshot);

  let adapterCache = factoryCache.get(definition);

  if (!adapterCache) {
    adapterCache = new WeakMap<object, FactoryCacheEntry<unknown>>();
    factoryCache.set(definition, adapterCache);
  }

  const cached = adapterCache.get(adapter);

  if (cached?.signature === signature) {
    return cached.factory as TemplateFactory<TNode>;
  }

  const factory = createFactory(snapshot, adapter);
  adapterCache.set(adapter, { signature, factory });

  return factory;
}
