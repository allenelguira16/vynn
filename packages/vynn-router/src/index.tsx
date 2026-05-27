import { $store, createContext, JSX } from "vynn";

export type Route = {
  path: string;
  component: () => JSX.Element;
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

export function isActiveRoute(path: string, exact = true): boolean {
  const current = $location.pathname;
  const currentParts = current.split("/").filter(Boolean);
  const targetParts = path.split("/").filter(Boolean);

  if (exact && currentParts.length !== targetParts.length) return false;
  if (!exact && currentParts.length < targetParts.length) return false;

  return targetParts.every((part, i) => {
    return part.startsWith(":") || part === currentParts[i];
  });
}

export function matchRoute(
  path: string,
  routes: Route[],
  basePath = "",
): { chain: Route[]; params: Record<string, string> } | undefined {
  const fullPath = (prefix: string, sub: string) => (prefix + "/" + sub).replace(/\/+/g, "/");

  const pathSegments = path.split("/").filter(Boolean);

  for (const route of routes) {
    const fullRoutePath = fullPath(basePath, route.path);
    const routeSegments = fullRoutePath.split("/").filter(Boolean);

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < routeSegments.length; i++) {
      const routePart = routeSegments[i];
      const pathPart = pathSegments[i];

      if (routePart?.startsWith("*")) {
        const key = routePart.slice(1) || "wildcard";
        params[key] = pathSegments.slice(i).join("/");
        return { chain: [route], params };
      }

      if (routePart?.startsWith(":")) {
        if (!pathPart) {
          matched = false;
          break;
        }
        params[routePart.slice(1)] = pathPart;
      } else if (routePart !== pathPart) {
        matched = false;
        break;
      }
    }

    if (!matched) continue;

    // 🔑 Give children a chance FIRST
    if (route.children) {
      const childMatch = matchRoute(path, route.children, fullRoutePath);
      if (childMatch) {
        return {
          chain: [route, ...childMatch.chain],
          params: { ...params, ...childMatch.params },
        };
      }
    }

    // If no child matched, exact-length match = valid
    if (routeSegments.length === pathSegments.length) {
      return { chain: [route], params };
    }
  }

  // fallback: /* catch-all
  const star = routes.find((r) => r.path.startsWith("*"));
  if (star) {
    const key = star.path.slice(1) || "wildcard";
    return { chain: [star], params: { [key]: pathSegments.join("/") } };
  }

  return undefined;
}

export const params = $store<Record<string, string>>({});

export function Router({ url, routes }: { url?: string; routes: Route[] }) {
  if (url) $location.pathname = url;

  return () => {
    const matched = matchRoute($location.pathname, routes);

    if (matched) {
      const { chain, params: extractedParams } = matched;
      for (const key in params) delete params[key];
      Object.assign(params, extractedParams);

      return buildComponentTree(chain);
    }

    for (const key in params) delete params[key];
    return <></>;
  };
}

const [OutletProvider, outletContext] = createContext<() => JSX.Element>();

export function Outlet() {
  const Child = outletContext();

  return <Child />;
}

function buildComponentTree(chain: Route[]): JSX.Element {
  // Start from the leaf
  let Component: () => JSX.Element = () => null;

  for (let i = chain.length - 1; i >= 0; i--) {
    const route = chain[i];

    const Comp = route.component;
    const child = Component;

    Component = () => (
      <OutletProvider value={child}>
        <Comp />
      </OutletProvider>
    );
  }

  return <Component />;
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
          if (!isActiveRoute(href)) navigate(href);
        }
      }}
    >
      {children()}
    </a>
  );
}
