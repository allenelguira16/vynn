'use strict';

require('vinxi/client');
var manifest = require('vinxi/manifest');
var vynn = require('vynn');
var client = require('vynn/client');
var server = require('vynn/server');
var vynnRouter = require('vynn-router');
var parseRoute = require('./cjs/chunks/parse-route-Dv6iTiKO.js');
require('vinxi/routes');

const hydrateClient = async (App) => {
  const clientManifest = manifest.getManifest("client");
  const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();
  const assets = <>
      {rawAssets.map(({ tag: Tag, attrs, children }) => <Tag {...attrs}>{children}</Tag>)}
      <vynn.NoHydration>
        <server.HydrateStreamScript />
      </vynn.NoHydration>
    </>;
  const scripts = <vynn.NoHydration />;
  client.hydrateApp(() => <App assets={assets} scripts={scripts}>
      <div id="app">
        <vynnRouter.Router url={location.pathname} routes={parseRoute.routes} />
      </div>
    </App>).mount(document);
};

exports.hydrateClient = hydrateClient;
//# sourceMappingURL=client.jsx.map
