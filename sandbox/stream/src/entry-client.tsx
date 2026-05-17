import "./main.css";

import { App } from "@vynn/common";
import { hydrateApp } from "vynn/client";

hydrateApp(() => <App url={location.pathname} />).mount("#app");
