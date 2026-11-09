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
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(targetPath)) {
    return false;
  }

  return matchRoute(targetPath, true, location);
}

/** Renders an anchor that navigates through the active Router. */
export function Link(
  props: PropsWithChildren<{
    href: string;
    activeClass?: string;
    class?: string;
    target?: string;
    download?: boolean | string;
  }>,
) {
  props.class ??= "";
  const location: Location = currentLocation();

  return (
    <a
      href={props.href}
      target={props.target}
      download={props.download}
      class={(
        props.class +
        (isActiveRoute(props.href, location) ? " " + (props.activeClass ?? "") : "")
      ).trim()}
      onClick={(event) => {
        if (isServer || event.defaultPrevented) return;

        // Preserve native anchor behavior for modified clicks, non-primary
        // buttons, downloads, and links targeting another browsing context.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.download !== undefined ||
          (props.target !== undefined && props.target.toLowerCase() !== "_self")
        ) {
          return;
        }

        const target = new URL(props.href, window.location.href);

        // Let the browser handle external URLs and non-HTTP schemes.
        if (
          target.origin !== window.location.origin ||
          (target.protocol !== "http:" && target.protocol !== "https:")
        ) {
          return;
        }

        event.preventDefault();
        navigate(target.pathname + target.search + target.hash, location);
      }}
    >
      {props.children}
    </a>
  );
}
