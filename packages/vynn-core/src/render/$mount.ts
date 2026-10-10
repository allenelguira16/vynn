import { JSX } from "../jsx-runtime";

export function $mount(Component: () => JSX.Element): JSX.Element;
export function $mount<P>(
  Component: (props: P) => JSX.Element,
  props: P,
): JSX.Element;
export function $mount(
  Component: (props?: unknown) => JSX.Element,
  props?: unknown,
): JSX.Element {
  return props === undefined ? Component() : Component(props);
}
