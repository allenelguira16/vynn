import type { JSX } from "vynn";

import { RouteOutlet } from "./outlet";
import { useRouteSlots } from "./slot-context";

/**
 * Renders one named parallel route branch from the nearest route component.
 *
 * Place this inside the route component that owns the matching @slot folder.
 * A missing slot match renders nothing.
 */
export function Slot(props: { name: string }): JSX.Element {
  const { router, parentNode } = useRouteSlots();

  return (
    <RouteOutlet
      router={router}
      depth={0}
      slotParent={parentNode}
      slotName={props.name}
    />
  );
}
