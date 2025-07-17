import { JSX } from "~/types";
import { isNil } from "~/util";

function hasNoHTMLTags(str: string) {
  // Matches anything inside <...>
  const htmlTagRegex = /<[^>]+>/g;
  return !htmlTagRegex.test(str);
}

/**
 * get the node for a JSX element
 *
 * @param jsxElement - The JSX element to get the node for.
 * @returns The node for the JSX element.
 */
export function getNodeString<T extends string | null>(
  jsxElement: JSX.Element,
  skipWrappingTags = false,
): T {
  if (isNil(jsxElement)) return null as T;

  if (typeof jsxElement === "string" || typeof jsxElement === "number") {
    let str = String(jsxElement);
    if (hasNoHTMLTags(str) && !skipWrappingTags) {
      str = `<!--!-->${str}<!--/-->`;
    }
    return str as unknown as T;
  }

  throw new Error(`Unknown value: ${jsxElement}`);
}
