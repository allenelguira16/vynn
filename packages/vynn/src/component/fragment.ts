import { JSX } from "~/types";
/**
 * Create a fragment
 *
 * @param children - The children of the fragment.
 * @returns The fragment.
 */
export function Fragment({ children }: { children?: () => JSX.Element }) {
  return children;
}
