import { Owner, disposeOwner } from "../life-cycle/owner";

/**
 * Associates a component's DOM marker with its owner.
 *
 * The marker is used to detect when the component is removed from the DOM so
 * its owner can be disposed.
 */
export const rootNodes = new WeakMap<Node, Owner>();

/**
 * Nodes that are temporarily detached by the renderer but still mounted.
 *
 * Suspense uses this when moving rendered content into a DocumentFragment.
 */
export const parkedNodes = new WeakSet<Node>();

export function isRootNode(node: Node): boolean {
  return rootNodes.has(node);
}

function visitNodeTree(node: Node, callback: (node: Node) => void): void {
  const stack: Node[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    callback(current);

    for (const child of current.childNodes) {
      stack.push(child);
    }
  }
}

export function markParked(node: Node): void {
  visitNodeTree(node, (current) => {
    if (rootNodes.has(current)) {
      parkedNodes.add(current);
    }
  });
}

export function unmarkParked(node: Node): void {
  visitNodeTree(node, (current) => {
    if (rootNodes.has(current)) {
      parkedNodes.delete(current);
    }
  });
}

type UnmountObserverState = {
  observer: MutationObserver;
  references: number;
};

const unmountObservers = new WeakMap<Document, UnmountObserverState>();

/**
 * Shares one document observer between mounted roots and disconnects it when
 * the final root is unmounted.
 */
export function addUnmountListener(): () => void {
  const targetDocument = document;
  let state = unmountObservers.get(targetDocument);

  if (!state) {
    const pendingDisposals = new Set<Node>();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          // A removed element may contain many nested component markers.
          visitNodeTree(removedNode, (node) => {
            if (rootNodes.has(node)) {
              pendingDisposals.add(node);
            }
          });
        }
      }

      queueMicrotask(() => {
        const errors: unknown[] = [];

        for (const node of pendingDisposals) {
          pendingDisposals.delete(node);

          // The component is intentionally parked by $if.
          if (parkedNodes.has(node)) continue;

          // The component was reinserted before disposal.
          if (node.isConnected) continue;

          const owner = rootNodes.get(node);
          if (!owner) continue;

          try {
            disposeOwner(owner);
          } catch (error) {
            errors.push(error);
          }
        }

        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) {
          throw new AggregateError(errors, "[Vynn] Multiple removed component cleanups failed.");
        }
      });
    });

    observer.observe(targetDocument, {
      childList: true,
      subtree: true,
    });
    state = { observer, references: 0 };
    unmountObservers.set(targetDocument, state);
  }

  state.references++;
  let active = true;

  return () => {
    if (!active) return;
    active = false;

    const current = unmountObservers.get(targetDocument);
    if (!current) return;

    current.references--;
    if (current.references === 0) {
      current.observer.disconnect();
      unmountObservers.delete(targetDocument);
    }
  };
}
