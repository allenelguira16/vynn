import type { JSX } from "../../types/jsx";
import { createSSRText } from "./resolve-node";

export function $text(value: string): JSX.Element {
  return createSSRText(value) as unknown as JSX.Element;
}