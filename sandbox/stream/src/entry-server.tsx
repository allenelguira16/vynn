import "./main.css";

import { App } from "@vynn/common";
import { renderToStream } from "vynn/server";

export const render = (url: string) => {
  return renderToStream(() => <App url={url} />);
};
