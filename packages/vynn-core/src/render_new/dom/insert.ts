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

/**
 * Inserts an ordered group of nodes before a reference child.
 *
 * A temporary DocumentFragment preserves the input order even when the nodes
 * are already attached to the destination parent and need to be reordered.
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

  const orderedNodes = Array.from(nodes);
  const seen = new Set<Node>();

  for (const node of orderedNodes) {
    assertNode(node);

    if (seen.has(node)) {
      throw new TypeError("[vynn]: A DOM node cannot appear more than once in one insertion.");
    }

    if (node === before) {
      throw new Error("[vynn]: The DOM insertion reference cannot be part of the inserted node group.");
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

  const fragment = document.createDocumentFragment();

  for (const node of orderedNodes) {
    fragment.appendChild(node);
  }

  parent.insertBefore(fragment, before);
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
