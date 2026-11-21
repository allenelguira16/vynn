import { isServer } from "../context/is-server-context";
import { $cmpnt as clientCmpnt, rootNodes, addUnmountListener, isRootNode, markParked, parkedNodes, unmarkParked } from "./client/$cmpnt";
import { $cmpnt as serverCmpnt } from "./server/$cmpnt";
import type { JSX } from "../types/jsx";

export function $cmpnt(Component: () => JSX.Element): () => JSX.Element;
export function $cmpnt<P>(Component: (props: P) => JSX.Element): (props?: P) => JSX.Element;
export function $cmpnt<P>(Component: ((props?: P) => JSX.Element) | (() => JSX.Element)) {
  return isServer() ? serverCmpnt(Component as never) : clientCmpnt(Component as never);
}

export { rootNodes, addUnmountListener, isRootNode, markParked, parkedNodes, unmarkParked };
