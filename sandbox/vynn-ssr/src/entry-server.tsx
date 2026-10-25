// SSR
import "./main.css";

import { App } from "./app";
import { renderToServer } from "vynn/server";

export function render(url: string) {
  return renderToServer(() => {
    return <App url={url} />;
  }, "stream");
}
