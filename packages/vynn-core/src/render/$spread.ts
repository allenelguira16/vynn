import { isServer } from "../context/is-server-context";
import { $spread as clientSpread } from "./client/$spread";
import { $spread as serverSpread } from "./server/$spread";

export function $spread<E extends Element, P extends Record<string, any>>(element: E, props: () => P): void {
  return isServer() ? serverSpread(element, props) : clientSpread(element, props);
}
