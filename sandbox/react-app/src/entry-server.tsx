import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router";
import type { ReactNode } from "react";
import App from "./app";

type StreamOptions = NonNullable<Parameters<typeof renderToPipeableStream>[1]>;

export function render(url: string, options: StreamOptions) {
  const app: ReactNode = (
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  );

  return renderToPipeableStream(app, options);
}
