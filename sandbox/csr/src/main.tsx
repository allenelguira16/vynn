import "./main.css";

import { App } from "@vynn/common";
import { createApp } from "vynn/client";

createApp(() => <App url={location.pathname} />).mount("#app");
