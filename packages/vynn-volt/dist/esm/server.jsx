import { eventHandler } from 'vinxi/http';
import { getManifest } from 'vinxi/manifest';
import { renderToStream, renderToString, HydrateStreamScript } from 'vynn/server';
import { Router } from 'vynn-router';
import { r as routes } from './esm/chunks/parse-route-BIk3jRTk.jsx';
import 'vinxi/routes';

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
      const stream = renderToStream(Component);
      return stream;
    } else {
      const html = renderToString(Component);
      return html;
    }
  });
};

export { renderServer };
//# sourceMappingURL=server.jsx.map
