import type {
  TemplateReference,
  TemplateReferenceKind,
} from "./types";

/**
 * Host operations needed to walk a template instance and inspect node kinds.
 *
 * This deliberately does not depend on TemplateAdapter: hydration and other
 * renderer subsystems can resolve compiler references without implementing
 * template parsing or cloning.
 */
export interface TemplateNodeResolver<TNode> {
  /** Read a node by its childNodes position. */
  getChild(parent: TNode, index: number): TNode | null | undefined;

  /** Return the semantic kind of a host node. */
  getKind(node: TNode): TemplateReferenceKind;
}

function assertRoots<TNode>(roots: readonly TNode[]): void {
  if (!Array.isArray(roots)) {
    throw new TypeError("[vynn]: Template reference resolution expects a root node array.");
  }
}

function assertResolver<TNode>(
  resolver: TemplateNodeResolver<TNode>,
): void {
  if (
    !resolver ||
    typeof resolver !== "object" ||
    typeof resolver.getChild !== "function" ||
    typeof resolver.getKind !== "function"
  ) {
    throw new TypeError("[vynn]: Template reference resolution expects a valid node resolver.");
  }
}

function validateReference(reference: TemplateReference): void {
  if (!reference || typeof reference !== "object") {
    throw new TypeError("[vynn]: A template reference must be an object.");
  }

  if (!Number.isSafeInteger(reference.id) || reference.id < 0) {
    throw new TypeError("[vynn]: Template reference IDs must be non-negative safe integers.");
  }

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

  if (reference.path.length === 0) {
    throw new TypeError(
      "[vynn]: Template reference " + reference.id + " must have a non-empty node path.",
    );
  }

  for (let index = 0; index < reference.path.length; index++) {
    const position = reference.path[index];

    if (!Number.isSafeInteger(position) || position < 0) {
      throw new TypeError(
        "[vynn]: Template reference " +
          reference.id +
          " has an invalid path index at position " +
          index +
          ".",
      );
    }
  }
}

function resolveValidatedReference<TNode>(
  roots: readonly TNode[],
  reference: TemplateReference,
  resolver: TemplateNodeResolver<TNode>,
): TNode {
  let node: TNode | null | undefined = roots[reference.path[0]];

  for (let index = 1; index < reference.path.length; index++) {
    if (node === null || node === undefined) break;
    node = resolver.getChild(node, reference.path[index]);
  }

  if (node === null || node === undefined) {
    throw new Error(
      "[vynn]: Template reference " +
        reference.id +
        " points to a missing node at path [" +
        reference.path.join(", ") +
        "].",
    );
  }

  const actualKind = resolver.getKind(node);

  if (actualKind !== reference.kind) {
    throw new Error(
      "[vynn]: Template reference " +
        reference.id +
        " expected a " +
        reference.kind +
        " node but resolved to " +
        actualKind +
        ".",
    );
  }

  return node;
}

/**
 * Resolves one compiler-emitted reference against an instantiated template.
 *
 * Paths address the root list first and then childNodes at each subsequent
 * index. Text and comment nodes are included in those positions.
 */
export function resolveTemplateReference<TNode>(
  roots: readonly TNode[],
  reference: TemplateReference,
  resolver: TemplateNodeResolver<TNode>,
): TNode {
  assertRoots(roots);
  assertResolver(resolver);
  validateReference(reference);

  return resolveValidatedReference(roots, reference, resolver);
}

/**
 * Resolves every reference in a template definition into an ID-to-node map.
 *
 * Duplicate IDs are rejected instead of silently replacing an earlier node.
 * The returned map is typed as read-only for consumers; the resolver retains
 * no reference to it and does not mutate it after returning.
 */
export function resolveTemplateReferences<TNode>(
  roots: readonly TNode[],
  references: readonly TemplateReference[],
  resolver: TemplateNodeResolver<TNode>,
): ReadonlyMap<number, TNode> {
  assertRoots(roots);
  assertResolver(resolver);

  if (!Array.isArray(references)) {
    throw new TypeError("[vynn]: Template references must be an array.");
  }

  const resolved = new Map<number, TNode>();

  for (const reference of references) {
    validateReference(reference);

    if (resolved.has(reference.id)) {
      throw new TypeError(
        "[vynn]: Duplicate template reference ID " + reference.id + ".",
      );
    }

    resolved.set(
      reference.id,
      resolveValidatedReference(roots, reference, resolver),
    );
  }

  return resolved;
}
