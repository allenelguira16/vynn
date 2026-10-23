import { JSX } from "../jsx-runtime";
import { getOwner } from "../life-cycle/owner";

export function $mount(Component: () => JSX.Element): JSX.Element;
export function $mount<P>(
  Component: (props: P) => JSX.Element,
  props: P,
): JSX.Element;
export function $mount(
  Component: (props?: unknown) => JSX.Element,
  props?: unknown,
): JSX.Element {
  // console.log();

  const owner = getOwner();

  if (!owner) throw new Error("Must be inside component");

  // if (cache.has(owner)) return cache.get(owner);

  const result = props === undefined ? Component() : Component(props);

  // cache.set(owner, result);

  console.log("rerun");

  return result;
}
