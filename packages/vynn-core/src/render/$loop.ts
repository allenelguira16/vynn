import { $state, type State } from "../reactivity/$state";
import { $effect } from "../reactivity/$effect";
import { mapArray } from "./$loop.util";

/**
 * Creates a reactive list renderer for an array of items.
 *
 * The list is updated whenever `items()` changes. Each item is rendered
 * using the function provided to `each()`, and the resulting nodes are
 * inserted, moved, or removed from the parent node as needed.
 *
 * @template T The type of each item in the list.
 * @param items A function that returns the current list of items.
 * @param parent The DOM node that contains the rendered list.
 * @returns An object with an `each` method for defining how each item is rendered.
 */
export function $loop<T>(items: () => T[], parent: Node) {
  function loop<T>({
    each,
    children,
  }: {
    each: () => T[];
    children: (item: T, index: State<number>) => Node;
  }) {
    const result = $state<Node[]>([]); // Holds the rendered elements.

    const listFn = mapArray(each, children);

    // Reactively update the list whenever `each()` changes.
    $effect(() => {
      const oldChildren = [...result.value];
      const newChildren = listFn();
      const oldSet = new Set(oldChildren);
      const newSet = new Set(newChildren);

      // TODO: Diff two old and new children.

      // Remove.
      for (const child of oldSet) {
        if (!newSet.has(child)) {
          parent.removeChild(child);
        }
      }

      // Insert / Move.
      for (let i = newChildren.length - 1; i >= 0; i--) {
        const child = newChildren[i];
        const anchor = i + 1 < newChildren.length ? newChildren[i + 1] : null;

        parent.insertBefore(child, anchor);
      }

      result.value = newChildren;
    });
  }

  return {
    /**
     * Renders each item in the reactive list.
     *
     * @param children A function that creates a DOM node for each item and
     * receives the item and its reactive index.
     * @returns The rendered list.
     */
    each: (children: (item: T, index: State<number>) => Node) => {
      const each = items as unknown as () => T[];

      children = children as unknown as [
        (item: T, index: State<number>) => Node,
      ][0];

      return loop({ each, children });
    },
  };
}
