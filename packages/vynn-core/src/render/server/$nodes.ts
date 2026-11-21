import type { JSX } from "../../types/jsx";
import { getCurrentDOMNamespace, withDOMNamespace } from "../namespace";
import { resolveSSRChild } from "./resolve-node";

export function $nodes(child: () => JSX.Element): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  return resolveSSRChild(() => withDOMNamespace(namespace, child)) as unknown as JSX.Element;
}