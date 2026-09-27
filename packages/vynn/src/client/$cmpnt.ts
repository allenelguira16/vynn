import { createOwner, runWithOwner } from "../life-cycle/owner";
import type { JSX } from "../jsx";
import { untrack } from "../reactivity/untrack";

export function $cmpnt(Component: () => JSX.Element): () => JSX.Element;

export function $cmpnt<P>(
  Component: (props: P) => JSX.Element,
): (props?: P) => JSX.Element;

export function $cmpnt<P>(
  Component: ((props: P) => JSX.Element) | (() => JSX.Element),
) {
  return (props?: P): JSX.Element => {
    const owner = createOwner();
    // owner.Component = Component;

    return runWithOwner(owner, () =>
      untrack(() => (Component as (props?: P) => JSX.Element)(props)),
    );
  };
}
