import type { JSX } from "../../types/jsx";
import { $state, type State } from "../../reactivity/state";
import { $nodes } from "./$nodes";
import { getCurrentDOMNamespace, withDOMNamespace } from "../namespace";

export function $for<T>(items: () => T[], each: (item: T, index: State<number>) => JSX.Element): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  return $nodes(() => items().map((item, index) => withDOMNamespace(namespace, () => each(item, $state(() => index)))));
}