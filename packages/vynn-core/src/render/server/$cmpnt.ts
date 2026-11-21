import type { JSX } from "../../types/jsx";
import { createOwner, runWithOwner } from "../../life-cycle/owner";
import { untrack } from "../../reactivity/effect";

export function $cmpnt(Component: () => JSX.Element): () => JSX.Element;
export function $cmpnt<P>(Component: (props: P) => JSX.Element): (props?: P) => JSX.Element;
export function $cmpnt<P>(Component: ((props?: P) => JSX.Element) | (() => JSX.Element)) {
  return (props?: P): JSX.Element => {
    const owner = createOwner();
    return runWithOwner(owner, () => untrack(() => [Component(props)].flat()));
  };
}