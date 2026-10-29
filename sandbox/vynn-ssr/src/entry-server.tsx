// SSR
import "./main.css";

import App from "./app";
import { renderToServer } from "vynn/server";

export function render(request: Request) {
  return renderToServer(() => <App url={request.url} />, "stream");
}
