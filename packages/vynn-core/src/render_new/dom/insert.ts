interface OriginalPosition {
  readonly node: Node;
  readonly parent: Node | null;
  readonly index: number;
}

function assertParent(parent: Node): void {
  if (
    !parent ||
    typeof parent !== "object" ||
    typeof parent.nodeType !== "number" ||
    typeof parent.insertBefore !== "function" ||
    (parent.nodeType !== 1 && parent.nodeType !== 9 && parent.nodeType !== 11)
  ) {
    throw new TypeError("[vynn]: DOM insertion expects an Element, Document, or DocumentFragment parent.");
  }
}

function assertNode(node: Node): void {
  if (!node || typeof node !== "object" || typeof node.nodeType !== "number") {
    throw new TypeError("[vynn]: DOM insertion expects valid Nodes.");
  }
}

function getOriginalPosition(node: Node): OriginalPosition {
  const parent = node.parentNode;

  if (!parent) {
    return { node, parent: null, index: -1 };
  }

  const index = Array.prototype.indexOf.call(parent.childNodes, node) as number;

  return { node, parent, index };
}

/**
 * Restores nodes to their original parents and sibling positions after an
 * insertion failure. This matters because nodes are staged in a fragment
 * before the final insertion, and a host hierarchy error must not strand them.
 */
function rollbackInsertion(
  positions: readonly OriginalPosition[],
  stagingFragment: DocumentFragment,
): unknown[] {
  const errors: unknown[] = [];
  const byParent = new Map<Node, OriginalPosition[]>();

  for (const position of positions) {
    if (position.parent) {
      const group = byParent.get(position.parent) ?? [];
      group.push(position);
      byParent.set(position.parent, group);
    } else if (position.node.parentNode) {
      try {
        position.node.parentNode.removeChild(position.node);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  for (const [parent, group] of byParent) {
    group.sort((left, right) => left.index - right.index);

    for (const position of group) {
      try {
        const reference = parent.childNodes.item(position.index) ?? null;
        parent.insertBefore(position.node, reference);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  // If any node was not represented in the original positions, do not leave
  // it stranded in the staging fragment.
  while (stagingFragment.firstChild) {
    try {
      stagingFragment.removeChild(stagingFragment.firstChild);
    } catch (error) {
      errors.push(error);
      break;
    }
  }

  return errors;
}

/**
 * Inserts an ordered group of nodes before a reference child.
 *
 * DocumentFragments are flattened because DOM insertion moves their children,
 * not the fragment object. A temporary DocumentFragment preserves input order
 * when nodes are already attached and need to be reordered.
 *
 * If the host rejects the final insertion (for example, because it would
 * violate Document hierarchy constraints), the nodes are restored to their
 * original parents and positions before the error is rethrown.
 */
export function insertDOMNodes(
  parent: Node,
  nodes: Iterable<Node>,
  before: Node | null = null,
): readonly Node[] {
  assertParent(parent);

  if (nodes === null || nodes === undefined || typeof nodes[Symbol.iterator] !== "function") {
    throw new TypeError("[vynn]: DOM insertion expects an iterable of Nodes.");
  }

  if (before !== null) {
    assertNode(before);

    if (before.parentNode !== parent) {
      throw new Error("[vynn]: The DOM insertion reference must be a child of the destination parent.");
    }
  }

  const inputNodes = Array.from(nodes);
  const orderedNodes: Node[] = [];

  for (const inputNode of inputNodes) {
    assertNode(inputNode);

    // Inserting a DocumentFragment inserts its children, not the fragment
    // object itself. A ShadowRoot is deliberately not treated as a fragment.
    if (inputNode.nodeType === 11 && !("host" in inputNode)) {
      orderedNodes.push(...Array.from(inputNode.childNodes));
    } else {
      orderedNodes.push(inputNode);
    }
  }

  const seen = new Set<Node>();

  for (const node of orderedNodes) {
    assertNode(node);

    if (seen.has(node)) {
      throw new TypeError("[vynn]: A DOM node cannot appear more than once in one insertion.");
    }

    if (node === before) {
      if (orderedNodes.length === 1 && before?.parentNode === parent) {
        return Object.freeze(orderedNodes);
      }

      throw new Error("[vynn]: The DOM insertion reference cannot be part of the inserted node group.");
    }

    if (node === parent || node.contains(parent)) {
      throw new Error("[vynn]: A DOM node cannot be inserted into itself or one of its descendants.");
    }

    seen.add(node);
  }

  if (orderedNodes.length === 0) return Object.freeze([]);

  const document = parent.nodeType === 9
    ? parent as Document
    : parent.ownerDocument;

  if (!document || typeof document.createDocumentFragment !== "function") {
    throw new TypeError("[vynn]: The DOM insertion parent has no owning Document.");
  }

  const positions = orderedNodes.map(getOriginalPosition);
  const fragment = document.createDocumentFragment();

  try {
    for (const node of orderedNodes) {
      fragment.appendChild(node);
    }

    parent.insertBefore(fragment, before);
  } catch (error) {
    const rollbackErrors = rollbackInsertion(positions, fragment);

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "[vynn]: DOM insertion failed and rollback could not fully restore the original nodes.",
      );
    }

    throw error;
  }

  return Object.freeze(orderedNodes);
}

/** Inserts one node before a reference child, or appends it when omitted. */
export function insertDOMNode(
  parent: Node,
  node: Node,
  before: Node | null = null,
): Node {
  insertDOMNodes(parent, [node], before);
  return node;
}
