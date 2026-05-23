'use strict';

var http = require('vinxi/http');
var manifest = require('vinxi/manifest');
var server = require('vynn/server');
var vynnRouter = require('vynn-router');
var parseRoute = require('./cjs/chunks/parse-route-Dv6iTiKO.js');
require('vinxi/routes');

const renderServer = (App, mode = "stream") => {
  return http.eventHandler(async (event) => {
    const clientManifest = manifest.getManifest("client");
    const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();
    const assets = () => <>
        {rawAssets.map(({ tag: Tag, attrs, children }) => <Tag {...attrs}>{children}</Tag>)}
        <server.HydrateStreamScript />
      </>;
    const manifest$1 = await clientManifest.json();
    const scripts = <>
        <script html={`window.manifest = ${JSON.stringify(manifest$1)}`} />
        <script type="module" src={clientManifest.inputs[clientManifest.handler].output.path} />
      </>;
    const Component = () => <>
        {`<!DOCTYPE html>`}
        <App assets={assets} scripts={scripts}>
          <vynnRouter.Router url={event.path} routes={parseRoute.routes} />
        </App>
      </>;
    event.node.res.setHeader("Content-Type", "text/html");
    if (mode === "stream") {
      const stream = server.renderToStream(Component);
      return stream;
    } else {
      const html = server.renderToString(Component);
      return html;
    }
  });
};

exports.renderServer = renderServer;
//# sourceMappingURL=server.jsx.map
