import { resolveTemplateReferences, type TemplateNodeResolver } from "./resolve";
import type {
  TemplateDefinition,
  TemplateInstance,
  TemplateReference,
} from "./types";

/**
 * Host-specific operation for cloning a parsed template blueprint.
 *
 * Implementations must return the top-level nodes of a fresh instance. DOM
 * adapters should deep-clone their parsed fragment; immutable server-side
 * adapters may reuse immutable leaf values but must return a fresh root list.
 */
export interface TemplateNodeCloner<TBlueprint, TNode> {
  clone(blueprint: TBlueprint): readonly TNode[];
}

/**
 * A runtime-immutable view over a map.
 *
 * Object.freeze(new Map()) does not prevent Map#set/delete/clear, so the
 * instance exposes only the ReadonlyMap operations and keeps the mutable Map
 * in a private field.
 */
class ImmutableMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  keys(): MapIterator<K> {
    return this.#map.keys();
  }

  values(): MapIterator<V> {
    return this.#map.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.#map.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "Map";
  }
}

function cloneRoots<TBlueprint, TNode>(
  blueprint: TBlueprint,
  cloner: TemplateNodeCloner<TBlueprint, TNode>,
): readonly TNode[] {
  if (
    !cloner ||
    typeof cloner !== "object" ||
    typeof cloner.clone !== "function"
  ) {
    throw new TypeError("[vynn]: Template instantiation expects a valid node cloner.");
  }

  const clonedRoots = cloner.clone(blueprint);

  if (!Array.isArray(clonedRoots)) {
    throw new TypeError("[vynn]: A template cloner must return an array of root nodes.");
  }

  const roots = [...clonedRoots];
  const objectRoots = new Set<object>();

  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];

    if (root === null || root === undefined) {
      throw new TypeError(
        "[vynn]: A template cloner returned an empty root at index " + index + ".",
      );
    }

    if ((typeof root === "object" && root !== null) || typeof root === "function") {
      const objectRoot = root as object;

      if (objectRoots.has(objectRoot)) {
        throw new TypeError(
          "[vynn]: A template cloner returned the same root node more than once.",
        );
      }

      objectRoots.add(objectRoot);
    }
  }

  return Object.freeze(roots);
}

/**
 * Clones a parsed blueprint and resolves its compiler-generated references.
 *
 * This is the single instantiation boundary used by template factories. It
 * snapshots the returned root list, rejects invalid root collections, and
 * returns a fresh instance whose reference table cannot be mutated by callers.
 */
export function cloneTemplateInstance<TBlueprint, TNode>(
  blueprint: TBlueprint,
  cloner: TemplateNodeCloner<TBlueprint, TNode>,
  references: readonly TemplateReference[],
  resolver: TemplateNodeResolver<TNode>,
): TemplateInstance<TNode> {
  if (!Array.isArray(references)) {
    throw new TypeError("[vynn]: Template instantiation expects a reference array.");
  }

  const roots = cloneRoots(blueprint, cloner);
  const resolvedReferences = resolveTemplateReferences(roots, references, resolver);
  const referenceTable = new ImmutableMap(resolvedReferences);

  return Object.freeze({
    roots,
    references: referenceTable,
  });
}

/**
 * Type-only helper for code that has a definition and needs its references
 * without retaining a wider TemplateDefinition dependency.
 */
export function getTemplateReferences(
  definition: Pick<TemplateDefinition, "references">,
): readonly TemplateReference[] {
  return definition.references;
}
