import { isServer } from "../context/is-server-context";
import { $nodes as clientNodes } from "./client/$nodes";
import { $nodes as serverNodes } from "./server/$nodes";
import type { JSX } from "../types/jsx";
import type { ServerRenderedLazyRange } from "../client/hydration";

export function $nodes(child: () => JSX.Element, existingRange?: ServerRenderedLazyRange): JSX.Element {
  return isServer() ? serverNodes(child) : clientNodes(child, existingRange);
}
