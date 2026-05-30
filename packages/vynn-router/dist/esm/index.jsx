import { $store, $state, $effect } from 'vynn';

const isServer = typeof window === "undefined";
const $location = $store({
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
function isActiveRoute(targetpath) {
  const pathname = $location.pathname;
  if (targetpath === "/") {
    return targetpath === pathname;
  }
  function toSegment(fullpath) {
    return fullpath.split("/").filter(Boolean).map((path) => `${path}`);
  }
  const pathnameSegment = toSegment(pathname);
  const targetnameSegment = toSegment(targetpath);
  if (pathnameSegment.length !== targetnameSegment.length) {
    return false;
  }
  return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}
function matchRoute(targetpath) {
  const pathname = $location.pathname;
  if (targetpath === "/") {
    return pathname.startsWith("/");
  }
  function toSegment(fullpath) {
    return fullpath.split("/").filter(Boolean).map((path) => `${path}`);
  }
  const pathnameSegment = toSegment(pathname);
  const targetnameSegment = toSegment(targetpath);
  return targetnameSegment.every((path, i) => path.startsWith(":") || path === pathnameSegment[i]);
}
const resolve = (routes) => {
  let oldPath;
  const view = $state(() => null);
  $effect(() => {
    for (const route of routes) {
      if (matchRoute(route.path)) {
        if (oldPath !== route.path) {
          oldPath = route.path;
          const children = (route.children || []).map((childRoute) => {
            return {
              ...childRoute,
              path: (route.path === "/" ? "" : route.path) + childRoute.path
            };
          });
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
function Router(props) {
  if (props.url) $location.pathname = props.url;
  return <>{resolve(props.routes)}</>;
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
        navigate(href);
      }
    }}
  >
      {children()}
    </a>;
}

export { $location, Link, Router, isActiveRoute, navigate };
//# sourceMappingURL=index.jsx.map
