import { JSX } from "~/jsx-runtime";
import { isNil } from "~/util/is-node-nil";

import { getNodeString } from "./get-node-string";

/**
 * Normalize return of component into string
 *
 * @param value JSX.Element
 * @returns string or null value of component
 */
export function normalizeToString(value: JSX.Element): string | null {
  if (isNil(value)) return null;

  if (typeof value === "function") {
    return normalizeToString(value());
  }

  if (Array.isArray(value)) {
    return value.map(normalizeToString).join("") || null;
  }

  return getNodeString(value);
}
