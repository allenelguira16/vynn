import fileRoutes, { RouteModule } from "vinxi/routes";
import { JSX } from "vynn";
import { Route } from "vynn-router";

/**
 * Build vinxi fileRoutes into vynn router tree
 *
 * @returns vynn router tree
 */
function buildRouteTree() {
  function buildNode(route: RouteModule, all: RouteModule[]): Route {
    const $layout = route.$$layout;
    const $component = route.$$component;

    const Layout: (() => JSX.Element) | undefined = $layout?.require().default;
    const Component: (() => JSX.Element) | undefined = $component?.require().default;

    // always create a node for the route (parent grouping)
    const node: Route = {
      path: route.path,
      children: [],
    };

    // find direct children (one level deeper)
    const directChildren = all.filter((r) => {
      if (r.path === route.path) return false;
      if (!r.path.startsWith(route.path === "/" ? "/" : route.path + "/")) return false;

      const rest = r.path.slice(route.path === "/" ? 1 : route.path.length + 1);
      return !rest.includes("/");
    });

    // If there's a layout -> parent must render the layout (keeps Outlet)
    if (Layout) {
      node.component = Layout;
      // if there's also a page component (page + layout), nest it at "/"
      if (Component) {
        node.children!.push({
          path: "/",
          component: Component,
        });
      }
    } else {
      // No layout:
      // - If there's a component and NO direct children => leaf route: parent becomes that component
      // - If there's a component and there ARE direct children => move the component into children as "/"
      if (Component) {
        if (directChildren.length === 0) {
          node.component = Component;
        } else {
          // Move page into children as "/"
          node.children!.push({
            path: "/",
            component: Component,
          });
        }
      }
      // If no component and no layout -> parent is just a grouping node (no component)
    }

    // Recurse direct children and normalize child paths relative to parent
    for (const child of directChildren) {
      const childNode = buildNode(child, all);

      // childNode.path is absolute (e.g. "/test/test").
      // We want it relative to parent:
      // - if equal to parent => "/"
      // - else remove parent prefix + slash and prepend "/"
      if (childNode.path === route.path) {
        childNode.path = "/";
      } else {
        // compute slice index: for root parent "/" slice from 1, else route.path.length + 1
        const baseIndex = route.path === "/" ? 1 : route.path.length + 1;
        const rest = childNode.path.slice(baseIndex);
        childNode.path = rest === "" ? "/" : "/" + rest;
      }

      node.children!.push(childNode);
    }

    if (node.children && node.children.length === 0) delete node.children;

    return node;
  }

  const rootDef = fileRoutes.find((r) => r.path === "/");
  if (!rootDef) throw new Error("Missing root /");

  return [buildNode(rootDef, fileRoutes)];
}

export const routes = buildRouteTree();
