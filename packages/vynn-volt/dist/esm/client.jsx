import 'vinxi/client';
import { getManifest } from 'vinxi/manifest';
import { NoHydration } from 'vynn';
import { hydrateApp } from 'vynn/client';
import { HydrateStreamScript } from 'vynn/server';
import { Router } from 'vynn-router';
import { r as routes } from './esm/chunks/parse-route-BIk3jRTk.jsx';
import 'vinxi/routes';

const hydrateClient = async (App) => {
  const clientManifest = getManifest("client");
  const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();
  const assets = <>
      {rawAssets.map(({ tag: Tag, attrs, children }) => <Tag {...attrs}>{children}</Tag>)}
      <NoHydration>
        <HydrateStreamScript />
      </NoHydration>
    </>;
  const scripts = <NoHydration />;
  hydrateApp(() => <App assets={assets} scripts={scripts}>
      <div id="app">
        <Router url={location.pathname} routes={routes} />
      </div>
    </App>).mount(document);
};

export { hydrateClient };
//# sourceMappingURL=client.jsx.map
