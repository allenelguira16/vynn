import { isServer } from "../context/is-server-context";
import { $on as clientOn } from "./client/$on";
import { $on as serverOn } from "./server/$on";

export function $on<E extends Element, K extends keyof HTMLElementEventMap>(element: E, event: K, handler: (event: HTMLElementEventMap[K] & { readonly currentTarget: E }) => void, capture = false): void {
  return isServer() ? serverOn(element, event, handler, capture) : clientOn(element, event, handler, capture);
}
