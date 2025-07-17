import "./main.css";

import { renderToString } from "vynn/server";

import { App } from "./App";

export const render = (url: string) => {
  return renderToString(() => <App url={url} />);
};
