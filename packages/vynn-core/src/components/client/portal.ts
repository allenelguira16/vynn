import type { JSX } from "../../types/jsx";
import type { PropsWithChildren } from "../../types/props";

import { onMount } from "../../life-cycle/on-mount";
import { $cmpnt } from "../../render/client/$cmpnt";
import { $insert } from "../../render/client/$insert";

/**
 * Renders its children into a specified mount node.
 *
 * The portal itself does not render anything at its original location.
 * Its children are inserted into the provided `mount` node after mounting.
 */
export const Portal = $cmpnt(function Portal<E extends Element>(
  props: PropsWithChildren<{ mount: E }>,
): JSX.Element {
  onMount(() => {
    if (!props.mount) return;

    if (props.mount instanceof Node) {
      $insert(props.mount, () => props.children);
    }
  });

  return null;
});
