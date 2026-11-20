import { createSsrComponentOwner } from "../context/ssr-string-context";
import { runWithOwner } from "../life-cycle/owner";
import { untrack } from "../reactivity/effect";

/**
 * Gives an SSR component invocation its own Vynn owner while leaving JSX
 * component calls as ordinary function calls in generated server code.
 */
export function $ssrComponent<Args extends unknown[], Result>(
  component: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => {
    const owner = createSsrComponentOwner(component);
    return runWithOwner(owner, () => untrack(() => component(...args)));
  };
}
