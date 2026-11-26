import { mountRenderNew } from "vynn/render_new";

import App from "./App";
import "./style.css";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("[render-new-app]: Missing #app mount element.");
}

mountRenderNew(root, App());
