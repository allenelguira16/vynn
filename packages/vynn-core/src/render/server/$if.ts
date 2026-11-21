import type { JSX } from "../../types/jsx";
import { getCurrentDOMNamespace, withDOMNamespace } from "../namespace";
import { resolveSSRChild } from "./resolve-node";

export function $if(condition: () => unknown, consequent: () => JSX.Element, alternate?: () => JSX.Element): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  const renderInNamespace = <T>(callback: () => T): T => withDOMNamespace(namespace, callback);
  return resolveSSRChild(() => renderInNamespace(() => {
    const value = condition();
    if (value) return consequent();
    if (alternate) return alternate();
    return (typeof value === "boolean" ? undefined : value) as JSX.Element;
  })) as unknown as JSX.Element;
}