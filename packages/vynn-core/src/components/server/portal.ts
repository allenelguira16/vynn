import type { JSX } from "../../types/jsx";
import type { PropsWithChildren } from "../../types/props";

import { $cmpnt } from "../../render/server/$cmpnt";

/** Portals are intentionally omitted from server-rendered output. */
export const Portal = $cmpnt(function Portal<E extends Element>(
  _props: PropsWithChildren<{ mount: E }>,
): JSX.Element {
  return null;
});
