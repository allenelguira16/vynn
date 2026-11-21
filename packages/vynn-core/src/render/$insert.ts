import type { JSX } from "../types/jsx";
import { isServer } from "../context/is-server-context";
import { $insert as clientInsert } from "./client/$insert";
import { $insert as serverInsert } from "./server/$insert";

export function $insert<E extends Element>(element: E, child: (() => JSX.Element) | JSX.Element, slotId: string): Node;
export function $insert<E extends Element>(element: E, child: (() => JSX.Element) | JSX.Element, before?: Node | null): void | (() => void);
export function $insert<E extends Element>(element: E, child: (() => JSX.Element) | JSX.Element, before: Node | string | null = null): void | (() => void) | Node {
  if (isServer()) return (serverInsert as typeof clientInsert)(element, child, before);
  return clientInsert(element, child, before);
}