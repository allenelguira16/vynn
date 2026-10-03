import { $effect, $state, $store, FC, PropsWithChildren } from "vynn";
import { $dyn } from "vynn/render";

export type Route = {
  path: string;
  component: FC<PropsWithChildren>;
  children?: Route[];
};

export type Location = {
  pathname: string;
  search: string;
};

type MatchedRoute = {
  route: Route;
  fullPath: string;
};

// Guard against SSR.
const isServer = typeof window === "undefined";

export const $location = $store<Location>({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : "",
});

if (!isServer) {
  window.addEventListener("popstate", () => {
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  });
}

/**
 * Updates the current URL and reactive location state.
 *
 * In the browser, the history entry is updated without reloading the page.
 * During SSR, only the reactive pathname is updated.
 *
 * @param path The path to navigate to.
 */
export function navigate(path: string): void {
  if (path === $location.pathname) {
    return;
  }

  if (!isServer) {
    history.pushState(null, "", path);
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  } else {
    $location.pathname = path;
  }
}

/**
 * Normalizes a pathname by collapsing repeated slashes and removing a
 * trailing slash.
 *
 * The root path is always represented as `/`.
 *
 * @param path The path to normalize.
 * @returns The normalized path.
 */
function normalizePath(path: string): string {
  if (!path || path === "/") {
    return "/";
  }

  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "");

  return normalized || "/";
}

/**
 * Splits a pathname into its non-empty segments.
 *
 * @param path The path to split.
 * @returns The normalized path segments.
 */
function toSegments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

/**
 * Checks whether a route path matches the current pathname.
 *
 * Dynamic segments beginning with `:` match any corresponding pathname
 * segment. Exact matches require the same number of segments, while
 * non-exact matches only require the target path to be a prefix.
 *
 * @param targetPath The route path to match.
 * @param exact Whether the pathname must match the route exactly.
 * @returns `true` when the route matches the current pathname.
 */
function matchRoute(targetPath: string, exact = true): boolean {
  const pathname = normalizePath($location.pathname);
  const target = normalizePath(targetPath);

  const pathnameSegments = toSegments(pathname);
  const targetSegments = toSegments(target);

  // Root.
  if (target === "/") {
    return exact ? pathname === "/" : true;
  }

  // Leaf route must match exactly.
  if (exact && pathnameSegments.length !== targetSegments.length) {
    return false;
  }

  // Layout route must at least fit inside the pathname.
  if (!exact && pathnameSegments.length < targetSegments.length) {
    return false;
  }

  return targetSegments.every(
    (segment, index) =>
      segment.startsWith(":") || segment === pathnameSegments[index],
  );
}

/**
 * Combines a parent route path with a child route path.
 *
 * @param parent The parent route path.
 * @param child The child route path.
 * @returns The combined normalized path.
 */
function joinPaths(parent: string, child: string): string {
  const normalizedParent = normalizePath(parent);

  if (normalizedParent === "/") {
    return normalizePath(child);
  }

  if (!child || child === "/") {
    return normalizedParent;
  }

  return normalizePath(`${normalizedParent}/${child}`);
}

/**
 * Finds the route selected by the current outlet.
 *
 * Only the routes provided to this outlet are evaluated. Child routes are
 * resolved by nested outlets rather than recursively by this function.
 *
 * @param routes The routes owned by the current outlet.
 * @param parentPath The path inherited from the parent outlet.
 * @returns The matching route and its full path, or `undefined` when no route matches.
 */
function findMatch(routes: Route[], parentPath = ""): MatchedRoute | undefined {
  for (const route of routes) {
    const fullPath = joinPaths(parentPath, route.path);
    const hasChildren = !!route.children?.length;

    // Parent/layout routes match by prefix.
    // Leaf routes match exactly.
    if (matchRoute(fullPath, !hasChildren)) {
      return {
        route,
        fullPath,
      };
    }
  }

  return undefined;
}

/**
 * Renders a single reactive routing level.
 *
 * The outlet reacts to changes in the current URL, but only recreates its
 * rendered component when the route selected by this outlet changes.
 *
 * Child routes are rendered through nested `RouteOutlet` instances.
 *
 * @param props The routes owned by this outlet and its parent path.
 * @returns The rendered route component.
 */
function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  const current = $state<MatchedRoute | undefined>();

  /**
   * Updates the selected route when the reactive pathname changes.
   *
   * The current match is only replaced when either the selected route or its
   * resolved full path changes.
   */
  $effect(() => {
    const next = findMatch(props.routes, props.parentPath ?? "");

    if (
      current.value?.route === next?.route &&
      current.value?.fullPath === next?.fullPath
    ) {
      return;
    }

    current.value = next;
  });

  /**
   * Renders only the currently selected route.
   *
   * Because this computation depends only on `current.value`, unrelated
   * pathname changes do not directly recreate the active component.
   */
  return $dyn(() => {
    const match = current.value;

    if (!match) {
      return null;
    }

    const { route, fullPath } = match;

    console.log(match);

    return route.component({
      get children() {
        return (
          <RouteOutlet routes={route.children || []} parentPath={fullPath} />
        );
      },
    });
  });
}

/**
 * Creates the root router outlet.
 *
 * When `url` is provided, it initializes the reactive location to that
 * pathname when it differs from the current pathname.
 *
 * @param props The router configuration and optional initial URL.
 * @returns The root route outlet.
 */
export function Router(props: { url?: string; routes: Route[] }) {
  if (props.url && props.url !== $location.pathname) {
    $location.pathname = props.url;
  }

  return <RouteOutlet routes={props.routes} />;
}

/**
 * Checks whether a path exactly matches the current pathname.
 *
 * Dynamic route segments beginning with `:` match the corresponding
 * pathname segment.
 *
 * @param targetpath The path to compare with the current pathname.
 * @returns `true` when the target path matches the current pathname.
 */
export function isActiveRoute(targetpath: string): boolean {
  const pathname = normalizePath($location.pathname);
  const target = normalizePath(targetpath);

  const pathnameSegments = toSegments(pathname);
  const targetSegments = toSegments(target);

  if (target === "/") {
    return pathname === "/";
  }

  if (pathnameSegments.length !== targetSegments.length) {
    return false;
  }

  return targetSegments.every(
    (segment, index) =>
      segment.startsWith(":") || segment === pathnameSegments[index],
  );
}

/**
 * Renders a navigation link that uses client-side routing.
 *
 * The link receives an active class when its `href` matches the current
 * pathname. In the browser, the default navigation is prevented and
 * `navigate()` is used instead.
 *
 * @param props The link destination, optional classes, and child content.
 * @returns The rendered anchor element.
 */
export function Link(
  props: PropsWithChildren<{
    href: string;
    activeClass?: string;
    class?: string;
  }>,
) {
  props.class ??= "";

  return (
    <a
      href={props.href}
      class={(
        props.class + (isActiveRoute(props.href) ? ` ${props.activeClass}` : "")
      ).trim()}
      onClick={(e) => {
        if (!isServer) {
          e.preventDefault();
          e.stopPropagation();
          navigate(props.href);
        }
      }}
    >
      {props.children}
    </a>
  );
}
