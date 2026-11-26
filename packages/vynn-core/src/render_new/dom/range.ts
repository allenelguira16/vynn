import { insertDOMNodes } from "./insert";
import { removeDOMNodes } from "./remove";

/**
 * Inclusive, sibling-contiguous DOM range delimited by two comment nodes.
 *
 * The anchors are part of the range. Nodes between them are the range content.
 * A newly-created range is detached until inserted into a parent.
 */
export interface DOMNodeRange {
  readonly start: Comment;
  readonly end: Comment;
}

function assertComment(node: Comment, label: "start" | "end"): void {
  if (
    !node ||
    typeof node !== "object" ||
    node.nodeType !== 8 ||
    typeof node.nodeValue !== "string"
  ) {
    throw new TypeError("[vynn]: A DOM range " + label + " boundary must be a Comment node.");
  }
}

function assertRange(range: DOMNodeRange): void {
  if (!range || typeof range !== "object") {
    throw new TypeError("[vynn]: Expected a DOM node range.");
  }

  assertComment(range.start, "start");
  assertComment(range.end, "end");

  if (range.start === range.end) {
    throw new TypeError("[vynn]: A DOM range requires distinct start and end anchors.");
  }
}

/** Creates detached comment boundaries for a new DOM range. */
export function createDOMRange(
  document: Document,
  label = "vynn",
): DOMNodeRange {
  if (
    !document ||
    typeof document !== "object" ||
    document.nodeType !== 9 ||
    typeof document.createComment !== "function"
  ) {
    throw new TypeError("[vynn]: createDOMRange() expects a DOM Document.");
  }

  if (typeof label !== "string") {
    throw new TypeError("[vynn]: A DOM range label must be a string.");
  }

  return Object.freeze({
    start: document.createComment(label + ":start"),
    end: document.createComment(label + ":end"),
  });
}

/**
 * Returns the range's inclusive sibling sequence.
 *
 * Detached boundaries form a valid empty range. A partially attached range,
 * boundaries under different parents, or an end anchor preceding/unreachable
 * from the start anchor is considered corrupt.
 */
export function getDOMRangeNodes(range: DOMNodeRange): readonly Node[] {
  assertRange(range);

  const parent = range.start.parentNode;

  if (parent === null && range.end.parentNode === null) {
    return Object.freeze([range.start, range.end]);
  }

  if (parent === null || range.end.parentNode !== parent) {
    throw new Error("[vynn]: DOM range boundaries must share the same parent.");
  }

  const nodes: Node[] = [];
  let current: Node | null = range.start;

  while (current) {
    nodes.push(current);

    if (current === range.end) {
      return Object.freeze(nodes);
    }

    current = current.nextSibling;
  }

  throw new Error("[vynn]: DOM range end anchor is not reachable from its start anchor.");
}

/** Returns only the nodes between the range's comment boundaries. */
export function getDOMRangeContentNodes(range: DOMNodeRange): readonly Node[] {
  const nodes = getDOMRangeNodes(range);
  return Object.freeze(nodes.slice(1, -1));
}

/** Returns whether both range boundaries are attached to the same parent. */
export function isDOMRangeAttached(range: DOMNodeRange): boolean {
  assertRange(range);

  return (
    range.start.parentNode !== null &&
    range.start.parentNode === range.end.parentNode
  );
}

/** Inserts a detached range or moves an attached range to a new position. */
export function insertDOMRange(
  parent: Node,
  range: DOMNodeRange,
  before: Node | null = null,
): DOMNodeRange {
  const nodes = getDOMRangeNodes(range);
  insertDOMNodes(parent, nodes, before);
  return range;
}

/**
 * Moves a complete contiguous range without recreating any of its nodes.
 *
 * If the insertion point is already inside the range, the operation is a
 * no-op because placing a range before one of its own nodes is ambiguous.
 */
export function moveDOMRange(
  range: DOMNodeRange,
  parent: Node,
  before: Node | null = null,
): DOMNodeRange {
  const nodes = getDOMRangeNodes(range);

  if (before !== null && nodes.includes(before)) {
    return range;
  }

  insertDOMNodes(parent, nodes, before);
  return range;
}

/** Removes both boundaries and every node between them. */
export function removeDOMRange(range: DOMNodeRange): number {
  const nodes = getDOMRangeNodes(range);
  return removeDOMNodes(nodes);
}
