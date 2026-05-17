import { eventHandler } from 'vinxi/http';
import { getManifest } from 'vinxi/manifest';
import { renderToString, HydrateStreamScript } from 'vynn/server';
import { Router } from 'vynn-router';
import fileRoutes from 'vinxi/routes';

function buildRouteTree() {
  function buildNode(route, all) {
    const $layout = route.$$layout;
    const $component = route.$$component;
    const Layout = $layout?.require().default;
    const Component = $component?.require().default;
    const node = {
      path: route.path,
      children: []
    };
    const directChildren = all.filter((r) => {
      if (r.path === route.path) return false;
      if (!r.path.startsWith(route.path === "/" ? "/" : route.path + "/")) return false;
      const rest = r.path.slice(route.path === "/" ? 1 : route.path.length + 1);
      return !rest.includes("/");
    });
    if (Layout) {
      node.component = Layout;
      if (Component) {
        node.children.push({
          path: "/",
          component: Component
        });
      }
    } else {
      if (Component) {
        if (directChildren.length === 0) {
          node.component = Component;
        } else {
          node.children.push({
            path: "/",
            component: Component
          });
        }
      }
    }
    for (const child of directChildren) {
      const childNode = buildNode(child, all);
      if (childNode.path === route.path) {
        childNode.path = "/";
      } else {
        const baseIndex = route.path === "/" ? 1 : route.path.length + 1;
        const rest = childNode.path.slice(baseIndex);
        childNode.path = rest === "" ? "/" : "/" + rest;
      }
      node.children.push(childNode);
    }
    if (node.children && node.children.length === 0) delete node.children;
    return node;
  }
  const rootDef = fileRoutes.find((r) => r.path === "/");
  if (!rootDef) throw new Error("Missing root /");
  return [buildNode(rootDef, fileRoutes)];
}
const routes = buildRouteTree();

const renderServer = (App, mode = "stream") => {
  return eventHandler(async (event) => {
    const clientManifest = getManifest("client");
    const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();
    const assets = () => <>
        {rawAssets.map(({ tag: Tag, attrs, children }) => <Tag {...attrs}>{children}</Tag>)}
        <HydrateStreamScript />
      </>;
    const manifest = await clientManifest.json();
    const scripts = <>
        <script html={`window.manifest = ${JSON.stringify(manifest)}`} />
        <script type="module" src={clientManifest.inputs[clientManifest.handler].output.path} />
      </>;
    const Component = () => <>
        {`<!DOCTYPE html>`}
        <App assets={assets} scripts={scripts}>
          <Router url={event.path} routes={routes} />
        </App>
      </>;
    event.node.res.setHeader("Content-Type", "text/html");
    if (mode === "stream") {
      const stream = renderToString(Component);
      return stream;
    } else {
      const html = renderToString(Component);
      return html;
    }
  });
};

export { renderServer };
//# sourceMappingURL=server.jsx.map
