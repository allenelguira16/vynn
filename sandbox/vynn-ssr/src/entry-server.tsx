// SSR
import "./main.css";

import App from "./app";
import { renderToServer } from "vynn/server";
import { runWithOwner } from "vynn";

// Re-export the owner bridge from this SSR module graph. The host server must
// use this function when activating an owner around render(), because Vite can
// evaluate the linked Vynn package separately from the host's module instance.
export { runWithOwner };

export function render(request: Request) {
  return renderToServer(() => <App url={request.url} />, "stream");
}
