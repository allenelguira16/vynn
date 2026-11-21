import { isServer } from "../context/is-server-context";
import { $if as clientIf } from "./client/$if";
import { $if as serverIf } from "./server/$if";
import type { JSX } from "../types/jsx";

export function $if(condition: () => unknown, consequent: () => JSX.Element, alternate?: () => JSX.Element): JSX.Element {
  return isServer() ? serverIf(condition, consequent, alternate) : clientIf(condition, consequent, alternate);
}
