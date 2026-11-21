import type { JSX } from "../types/jsx";

import { isServer } from "../context/is-server-context";
import { $cmpnt as clientCmpnt } from "../render/client/$cmpnt";
import { $cmpnt as serverCmpnt } from "../render/server/$cmpnt";

/**
 * Defines a framework component that can be invoked by either render target.
 *
 * The target is selected when the component is invoked, rather than when its
 * module is evaluated. This matters for shared exports such as Await and
 * Portal, which are commonly imported before an SSR render context exists.
 */
export function createComponent(Component: () => JSX.Element): () => JSX.Element;
export function createComponent<P>(Component: (props: P) => JSX.Element): (props?: P) => JSX.Element;
export function createComponent<P>(
  Component: ((props?: P) => JSX.Element) | (() => JSX.Element),
) {
  const clientComponent = clientCmpnt(Component as never);
  const serverComponent = serverCmpnt(Component as never);

  return (props?: P): JSX.Element =>
    isServer() ? serverComponent(props) : clientComponent(props);
}
