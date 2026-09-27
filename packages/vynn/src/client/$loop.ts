import { $state, type State } from "../reactivity/$state";
import { $effect } from "../reactivity/$effect";
import { mapArray } from "./$loop.util";

export function $loop<T>(items: () => T[], parent: Node) {
  function loop<T>({
    each,
    children,
  }: {
    each: () => T[];
    children: (item: T, index: State<number>) => Node;
  }) {
    const result = $state<Node[]>([]); // holds rendered elements

    // const handler = getSuspenseHandler();
    const listFn = mapArray(each, children);

    // Reactively update the list whenever props.each() changes
    $effect(() => {
      const oldChildren = [...result.value];
      const newChildren = listFn();

      const oldSet = new Set(oldChildren);
      const newSet = new Set(newChildren);

      // TODO: Diff two old and new children
      // Remove
      for (const child of oldSet) {
        if (!newSet.has(child)) {
          parent.removeChild(child);
        }
      }

      // Insert / Move
      for (let i = newChildren.length - 1; i >= 0; i--) {
        const child = newChildren[i];
        const anchor = i + 1 < newChildren.length ? newChildren[i + 1] : null;

        parent.insertBefore(child, anchor);
      }

      result.value = newChildren;
    });
  }

  return {
    each: (children: (item: T, index: State<number>) => Node) => {
      const each = items as unknown as () => T[];
      children = children as unknown as [
        (item: T, index: State<number>) => Node,
      ][0];

      return loop({ each, children });
    },
  };
}
