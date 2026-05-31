import { $effect, $state, $store, FC, JSX, PropsWithChildren } from "vynn";

export type Route = {
  path: string;
  component: FC<PropsWithChildren>;
  children?: Route[];
};

export type Location = {
  pathname: string;
  search: string;
};

// guard against SSR
const isServer = typeof window === "undefined";

export const $location = $store<Location>({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : "",
});

// only register popstate listener on client
if (!isServer) {
  window.addEventListener("popstate", () => {
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  });
}

export function navigate(path: string) {
  if (path === $location.pathname) return;

  if (!isServer) {
    history.pushState(null, "", path);
    $location.pathname = path;
    $location.search = window.location.search;
  } else {
    $location.pathname = path;
  }
}

export function isActiveRoute(targetpath: string) {
  const pathname = $location.pathname;

  if (targetpath === "/") {
    return targetpath === pathname;
  }

  function toSegment(fullpath: string) {
    return fullpath
      .split("/")
      .filter(Boolean)
      .map((path) => `${path}`);
  }

  const pathnameSegment = toSegment(pathname);
  const targetnameSegment = toSegment(targetpath);

  if (pathnameSegment.length !== targetnameSegment.length) {
    return false;
  }

  return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}

function matchRoute(targetpath: string) {
  const pathname = $location.pathname;

  if (targetpath === "/") {
    return pathname.startsWith("/");
  }

  function toSegment(fullpath: string) {
    return fullpath
      .split("/")
      .filter(Boolean)
      .map((path) => `${path}`);
  }

  const pathnameSegment = toSegment(pathname);
  const targetnameSegment = toSegment(targetpath);

  return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}

const resolve = (routes: Route[]) => {
  let oldPath: string;
  const view = $state<FC>(() => null);

  $effect(() => {
    for (const route of routes) {
      if (matchRoute(route.path)) {
        if (oldPath !== route.path) {
          oldPath = route.path;
          const children = (route.children || []).map((childRoute) => {
            return {
              ...childRoute,
              path: (route.path === "/" ? "" : route.path) + childRoute.path,
            };
          });
          // console.log(children);
          // TODO: Fix lifecycle hooks onMount onDestroy
          view.value = () => route.component({ children: () => resolve(children) });
        }
      }
    }
  });

  return () => {
    const Component = view.value;

    return <Component />;
  };
};

export function Router(props: { url?: string; routes: Route[] }) {
  if (props.url) $location.pathname = props.url;

  return <>{resolve(props.routes)}</>;
}

export function Link({
  children,
  href,
  activeClass,
  class: className,
}: {
  children: () => JSX.Element;
  href: string;
  activeClass?: string;
  class?: string;
}) {
  className ??= "";
  return (
    <a
      href={href}
      class={(className + (isActiveRoute(href) ? ` ${activeClass}` : "")).trim()}
      onClick={(e) => {
        if (!isServer) {
          e.preventDefault();
          e.stopPropagation();
          // if (!isActiveRoute(href, true))
          navigate(href);
        }
      }}
    >
      {children()}
    </a>
  );
}
