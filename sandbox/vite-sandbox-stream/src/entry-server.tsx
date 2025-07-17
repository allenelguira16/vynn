import "./main.css";

import { renderToStream } from "vynn/server";

import { App } from "./App";

export const render = (url: string) => {
  return renderToStream(() => <App url={url} />);
};
