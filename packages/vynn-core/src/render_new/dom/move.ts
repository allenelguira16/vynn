import { insertDOMNode, insertDOMNodes } from "./insert";

/** Moves one node to a new position, preserving its identity and descendants. */
export function moveDOMNode(
  node: Node,
  parent: Node,
  before: Node | null = null,
): Node {
  insertDOMNode(parent, node, before);
  return node;
}

/** Moves an ordered group of nodes as one operation. */
export function moveDOMNodes(
  nodes: Iterable<Node>,
  parent: Node,
  before: Node | null = null,
): readonly Node[] {
  return insertDOMNodes(parent, nodes, before);
}
