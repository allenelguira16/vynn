/**
 * observe a node and call a callback when it is removed
 *
 * @param targetNode - The target node to observe.
 * @param callback - The callback to call when the node is removed.
 */
export const unMount = (callback: () => void, targetNode: Node) => {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const isRemoved = Array.from(mutation.removedNodes).includes(targetNode);

      if (isRemoved) {
        callback();
        observer.disconnect();
      }
    }
  });

  if (targetNode.parentNode)
    observer.observe(targetNode.parentNode, { childList: true, subtree: true });
};
