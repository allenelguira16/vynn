import type { PropsWithChildren } from "vynn";

import { isServer } from "./environment";
import { currentLocation, navigate } from "./location";
import { matchRoute } from "./path";
import type { Location } from "./types";

/** Checks whether a path matches the current pathname. */
export function isActiveRoute(
  targetPath: string,
  location = currentLocation(),
): boolean {
  return matchRoute(targetPath, true, location);
}

/** Renders an anchor that navigates through the active Router. */
export function Link(
  props: PropsWithChildren<{
    href: string;
    activeClass?: string;
    class?: string;
  }>,
) {
  props.class ??= "";
  const location: Location = currentLocation();

  return (
    <a
      href={props.href}
      class={(
        props.class +
        (isActiveRoute(props.href, location) ? " " + (props.activeClass ?? "") : "")
      ).trim()}
      onClick={(event) => {
        if (!isServer) {
          event.preventDefault();
          event.stopPropagation();
          navigate(props.href, location);
        }
      }}
    >
      {props.children}
    </a>
  );
}
