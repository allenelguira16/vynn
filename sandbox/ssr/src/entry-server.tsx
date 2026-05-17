import "./main.css";

import { App } from "@vynn/common";
import { renderToString } from "vynn/server";

export const render = (url: string) => {
  return renderToString(() => <App url={url} />);
};
