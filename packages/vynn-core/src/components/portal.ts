import { JSX } from "../types/jsx";
import { onMount } from "../life-cycle/on-mount";
import { $cmpnt, $insert } from "../render";
import { PropsWithChildren } from "../types/props";
import { IS_SERVER_ENV } from "../utils/is-server-env";

/**
 * Renders its children into a specified mount node.
 *
 * The portal itself does not render anything at its original location.
 * Its children are inserted into the provided `mount` node after mounting.
 *
 * @param props The portal mount node and child content to render.
 * @returns `null` because the portal does not render at its original location.
 */
export const Portal = $cmpnt(function Portal<E extends HTMLElement>(
  props: PropsWithChildren<{ mount: E }>,
): JSX.Element {
  if (IS_SERVER_ENV) {
    return null;
  }

  onMount(() => {
    if (!props.mount) return;

    if (props.mount instanceof Node) {
      $insert(props.mount, () => props.children);
    }
  });

  return null;
});
