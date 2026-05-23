import "./main.css";

import { App } from "@vynn/common";
import { hydrateApp } from "vynn/client";

hydrateApp(() => {
  return <App url={location.pathname} />;
}).mount("#app");
