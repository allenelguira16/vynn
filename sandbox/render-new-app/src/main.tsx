import { mountRenderNew, type RenderNewComponent } from "vynn/render_new";

import App from "./App";
import "./style.css";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("[render-new-app]: Missing #app mount element.");
}

// The experimental transform replaces JSX return values with deferred descriptors.
mountRenderNew(root, App() as unknown as RenderNewComponent);
