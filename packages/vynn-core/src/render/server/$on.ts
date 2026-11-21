import type { JSX } from "../../types/jsx";

/** Event bindings have no server-side effect. */
export function $on<E extends Element, K extends keyof HTMLElementEventMap>(
  _element: E,
  _event: K,
  _handler: (event: HTMLElementEventMap[K] & { readonly currentTarget: E }) => void,
  _capture = false,
): void {}