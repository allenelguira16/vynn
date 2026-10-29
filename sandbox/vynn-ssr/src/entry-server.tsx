// SSR
import "./main.css";

import App from "./app";
import { renderToServer } from "vynn/server";
import { handleServerFunctionRequest } from "virtual:vynn/server-functions";

// The custom Express server uses the same SSR build for both HTML rendering
// and the production server-function RPC endpoint.
export { handleServerFunctionRequest };

export function render(request: Request) {
  return renderToServer(() => <App url={request.url} />, "stream");
}
