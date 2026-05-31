import { jsx } from "~/client/jsx";
import { $effect } from "~/reactivity/effect";
import { $state, State } from "~/reactivity/state";
import { type JSX } from "~/types/jsx";
import { isServer } from "~/util/server-util";

import { mapArray } from "./loop.util";

export type Entry<T> = {
  item: T;
  nodes: Node[];
  index: { value: number };
};

/**
 * An array helper for iterating arrays efficiently
 *
 * @param items - The items to loop through.
 * @returns each fn.
 */
export function loop<T>(items: T[]) {
  return {
    each(children: (item: T, index: State<number>) => JSX.Element) {
      const each = items as unknown as () => T[];
      children = children as unknown as [(item: T, index: State<number>) => JSX.Element][0];

      if (isServer) {
        const renderedItems = each().map((item, i) => children(item, { value: i }));

        return renderedItems;
      }

      // Use jsx to register it as a component
      // That way we can use life cycles hooks
      return jsx(Loop as any, { each, children });
    },
  };
}

/**
 * Loop component for iterating arrays efficiently
 *
 * @param param0
 * @returns fine-grained array computation
 */
export function Loop<T>({
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
    // try {
    result.value = listFn();
    // } catch (err) {
    //   if (err instanceof Promise && handler) {
    //     handler(err); // register promise with Suspense
    //   } else {
    //     throw err; // real error
    //   }
    // }
  });

  // Return a getter so that the view updates when result changes
  return () => result.value;
}
