// SSR
import "./main.css";

import { App } from "./app";
import { renderToString } from "vynn/render";

export function render(url: string) {
  return renderToString(() => App({ url }));
}
