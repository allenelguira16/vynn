// SSR
import "./main.css";

import { App } from "./app";
import { renderToServer } from "vynn/render";

export function render(url: string) {
  return renderToServer(() => App({ url }), "async");
}
