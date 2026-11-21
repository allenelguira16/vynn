import { isServer } from "../context/is-server-context";
import { $for as clientFor } from "./client/$for";
import { $for as serverFor } from "./server/$for";
import { isEqual } from "./shared/equality";
import type { JSX } from "../types/jsx";
import type { State } from "../reactivity/state";

export function $for<T>(items: () => T[], each: (item: T, index: State<number>) => JSX.Element): JSX.Element {
  return isServer() ? serverFor(items, each) : clientFor(items, each);
}

export { isEqual };
