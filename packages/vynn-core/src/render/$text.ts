import { isServer } from "../context/is-server-context";
import { $text as clientText } from "./client/$text";
import { $text as serverText } from "./server/$text";
import type { JSX } from "../types/jsx";

export function $text(value: string): JSX.Element {
  return isServer() ? serverText(value) : clientText(value);
}
