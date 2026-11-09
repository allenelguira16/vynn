import { INTERNAL_RANGE_END_MARKER, INTERNAL_RANGE_START_MARKER } from "../const";

/**
 * Returns true when a node is enclosed by an internal SSR range.
 *
 * The scan walks previous siblings from the node towards its ancestors. A
 * depth counter keeps nested ranges balanced without adding attributes to
 * every resource element.
 */
export function isWithinInternalRange(node: Node): boolean {
  let current: Node | null = node;

  while (current?.parentNode) {
    let depth = 0;
    let sibling = current.previousSibling;

    while (sibling) {
      if (isInternalRangeEnd(sibling)) {
        depth++;
      } else if (isInternalRangeStart(sibling)) {
        if (depth === 0) return true;
        depth--;
      }

      sibling = sibling.previousSibling;
    }

    current = current.parentNode;
  }

  return false;
}

/** Removes internal range delimiters while preserving their contents. */
export function removeInternalRangeMarkers(root: Node): void {
  for (const child of [...root.childNodes]) {
    if (isInternalRangeMarker(child)) {
      child.parentNode?.removeChild(child);
      continue;
    }

    removeInternalRangeMarkers(child);
  }
}

function isInternalRangeMarker(node: Node): node is Comment {
  return isInternalRangeStart(node) || isInternalRangeEnd(node);
}

function isInternalRangeStart(node: Node): node is Comment {
  return node.nodeType === 8 && node.nodeValue === INTERNAL_RANGE_START_MARKER;
}

function isInternalRangeEnd(node: Node): node is Comment {
  return node.nodeType === 8 && node.nodeValue === INTERNAL_RANGE_END_MARKER;
}
