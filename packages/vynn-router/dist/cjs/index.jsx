'use strict';

var vynn = require('vynn');

const isServer = typeof window === "undefined";
const $location = vynn.$store({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : ""
});
if (!isServer) {
  window.addEventListener("popstate", () => {
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  });
}
function navigate(path) {
  if (path === $location.pathname) return;
  if (!isServer) {
    history.pushState(null, "", path);
    $location.pathname = path;
    $location.search = window.location.search;
  } else {
    $location.pathname = path;
  }
}
function isActiveRoute(path, exact = true) {
  const current = $location.pathname;
  const currentParts = current.split("/").filter(Boolean);
  const targetParts = path.split("/").filter(Boolean);
  if (exact && currentParts.length !== targetParts.length) return false;
  if (!exact && currentParts.length < targetParts.length) return false;
  return targetParts.every((part, i) => {
    return part.startsWith(":") || part === currentParts[i];
  });
}
function matchRoute(path, routes, basePath = "") {
  const fullPath = (prefix, sub) => (prefix + "/" + sub).replace(/\/+/g, "/");
  const pathSegments = path.split("/").filter(Boolean);
  for (const route of routes) {
    const fullRoutePath = fullPath(basePath, route.path);
    const routeSegments = fullRoutePath.split("/").filter(Boolean);
    const params2 = {};
    let matched = true;
    for (let i = 0; i < routeSegments.length; i++) {
      const routePart = routeSegments[i];
      const pathPart = pathSegments[i];
      if (routePart?.startsWith("*")) {
        const key = routePart.slice(1) || "wildcard";
        params2[key] = pathSegments.slice(i).join("/");
        return { chain: [route], params: params2 };
      }
      if (routePart?.startsWith(":")) {
        if (!pathPart) {
          matched = false;
          break;
        }
        params2[routePart.slice(1)] = pathPart;
      } else if (routePart !== pathPart) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (route.children) {
      const childMatch = matchRoute(path, route.children, fullRoutePath);
      if (childMatch) {
        return {
          chain: [route, ...childMatch.chain],
          params: { ...params2, ...childMatch.params }
        };
      }
    }
    if (routeSegments.length === pathSegments.length) {
      return { chain: [route], params: params2 };
    }
  }
  const star = routes.find((r) => r.path.startsWith("*"));
  if (star) {
    const key = star.path.slice(1) || "wildcard";
    return { chain: [star], params: { [key]: pathSegments.join("/") } };
  }
  return void 0;
}
const params = vynn.$store({});
function Router({ url, routes }) {
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
const [OutletProvider, outletContext] = vynn.createContext();
function Outlet() {
  const Child = outletContext();
  return <Child />;
}
function buildComponentTree(chain) {
  let Component = () => null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const route = chain[i];
    const Comp = route.component;
    const child = Component;
    Component = () => <OutletProvider value={child}>
        <Comp />
      </OutletProvider>;
  }
  return <Component />;
}
function Link({
  children,
  href,
  activeClass,
  class: className
}) {
  className ?? (className = "");
  return <a
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
    </a>;
}

exports.$location = $location;
exports.Link = Link;
exports.Outlet = Outlet;
exports.Router = Router;
exports.isActiveRoute = isActiveRoute;
exports.matchRoute = matchRoute;
exports.navigate = navigate;
exports.params = params;
//# sourceMappingURL=index.jsx.map
