'use strict';

require('vinxi/client');
var client = require('vynn/client');
var vynnRouter = require('vynn-router');
var parseRoute = require('./cjs/chunks/parse-route-Dv6iTiKO.js');
require('vinxi/routes');

const hydrateClient = async (App) => {
  client.hydrateApp(() => <vynnRouter.Router url={location.pathname} routes={parseRoute.routes} />).mount("#app");
};

exports.hydrateClient = hydrateClient;
//# sourceMappingURL=client.jsx.map
