import "./main.css";

import { hydrateApp } from "vynn/client";

import { App } from "./App";

hydrateApp(() => <App url={location.pathname} />).mount("#app");
