function assertNode(node: Node): void {
  if (!node || typeof node !== "object" || typeof node.nodeType !== "number") {
    throw new TypeError("[vynn]: DOM removal expects a valid Node.");
  }
}

/** Removes a node from its current parent. Returns false when already detached. */
export function removeDOMNode(node: Node): boolean {
  assertNode(node);

  const parent = node.parentNode;
  if (!parent) return false;

  parent.removeChild(node);
  return true;
}

/** Removes every supplied node and returns the number that were attached. */
export function removeDOMNodes(nodes: Iterable<Node>): number {
  if (nodes === null || nodes === undefined || typeof nodes[Symbol.iterator] !== "function") {
    throw new TypeError("[vynn]: DOM removal expects an iterable of Nodes.");
  }

  const orderedNodes = Array.from(nodes);
  const seen = new Set<Node>();

  for (const node of orderedNodes) {
    assertNode(node);

    if (seen.has(node)) {
      throw new TypeError("[vynn]: A DOM node cannot appear more than once in one removal.");
    }

    seen.add(node);
  }

  let removed = 0;

  for (const node of orderedNodes) {
    if (removeDOMNode(node)) removed++;
  }

  return removed;
}
