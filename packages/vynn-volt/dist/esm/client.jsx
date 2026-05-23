import 'vinxi/client';
import { hydrateApp } from 'vynn/client';
import { Router } from 'vynn-router';
import { r as routes } from './esm/chunks/parse-route-BIk3jRTk.jsx';
import 'vinxi/routes';

const hydrateClient = async (App) => {
  hydrateApp(() => <Router url={location.pathname} routes={routes} />).mount("#app");
};

export { hydrateClient };
//# sourceMappingURL=client.jsx.map
