import { isServer } from "../context/is-server-context";
import { $cmpnt as clientCmpnt, rootNodes, addUnmountListener, isRootNode, markParked, parkedNodes, unmarkParked } from "./client/$cmpnt";
import { $cmpnt as serverCmpnt } from "./server/$cmpnt";
import type { JSX } from "../types/jsx";

export function $cmpnt(Component: () => JSX.Element): () => JSX.Element;
export function $cmpnt<P>(Component: (props: P) => JSX.Element): (props?: P) => JSX.Element;
export function $cmpnt<P>(Component: ((props?: P) => JSX.Element) | (() => JSX.Element)) {
  // Components are commonly wrapped at module evaluation time, before an SSR
  // render owner (and its render-mode context) exists. Select the target when
  // the component is invoked, not when its wrapper is created.
  const clientComponent = clientCmpnt(Component as never);
  const serverComponent = serverCmpnt(Component as never);

  return (props?: P): JSX.Element =>
    isServer() ? serverComponent(props) : clientComponent(props);
}

export { rootNodes, addUnmountListener, isRootNode, markParked, parkedNodes, unmarkParked };
