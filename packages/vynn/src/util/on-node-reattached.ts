/**
 * observe a node and call a callback when it is reattached
 *
 * @param callback - The callback to call when the node is reattached.
 * @param targetNode - The node to observe.
 */
export function onNodeReattached(callback: () => void, targetNode: Node) {
  // Create a MutationObserver instance
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      // Check for added nodes
      for (const node of mutation.addedNodes) {
        if (node === targetNode) {
          observer.disconnect();
          callback();
          break;
        }
      }
    }
  });

  queueMicrotask(() => {
    if (!targetNode.parentNode) {
      return;
    }

    observer.observe(targetNode, { childList: true, subtree: true });
  });
}

/**
 * observe a node and call a callback when it is removed
 *
 * @param callback - The callback to call when the node is removed.
 * @param targetNode - The node to observe.
 */
export function onNodeRemove(callback: () => void, targetNode: Node) {
  const observer = new MutationObserver(() => {
    if (!targetNode.isConnected) {
      observer.disconnect();
      callback();
    }
  });

  queueMicrotask(() => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
