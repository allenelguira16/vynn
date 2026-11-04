import type { PropsWithChildren } from "vynn";

import { isServer } from "./environment";
import { currentLocation, navigate } from "./location";
import { normalizePath, toSegments } from "./path";
import type { Location } from "./types";

/** Checks whether a path matches the current pathname. */
export function isActiveRoute(
  targetPath: string,
  location = currentLocation(),
): boolean {
  const pathname = normalizePath(location.pathname);
  const target = normalizePath(targetPath);
  const pathnameSegments = toSegments(pathname);
  const targetSegments = toSegments(target);

  if (target === "/") return pathname === "/";
  if (pathnameSegments.length !== targetSegments.length) return false;

  return targetSegments.every(
    (segment, index) => segment.startsWith(":") || segment === pathnameSegments[index],
  );
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
