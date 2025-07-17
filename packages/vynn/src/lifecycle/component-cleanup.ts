const cleanupMap = new Map<Node, (() => void)[]>();

/**
 * set the component cleanup
 *
 * @param node - The node.
 * @param cleanups - The cleanups.
 */
export function setComponentCleanup(node: Node, cleanups: (() => void)[]) {
  cleanupMap.set(node, cleanups);
}

/**
 * run the component cleanup
 *
 * @param node - The node.
 */
export function runComponentCleanup(node: Node) {
  // Cleanup for the current node
  const cleanups = cleanupMap.get(node);
  if (cleanups) {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanupMap.delete(node);
  }

  // Recursively clean child nodes
  if (node instanceof HTMLElement) {
    for (const child of node.childNodes) {
      runComponentCleanup(child);
    }
  }
}
