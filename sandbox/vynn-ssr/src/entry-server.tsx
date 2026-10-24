// SSR
import "./main.css";

import { App } from "./app";
import { renderToServer } from "vynn/server";

export function render(url: string) {
  return renderToServer(() => App({ url }), "stream");
}
