// SSR
import "./main.css";

import { App } from "./app";
import { renderToString } from "vynn/render";

export function render() {
  return renderToString(App);
}
