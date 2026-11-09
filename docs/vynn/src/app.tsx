import "./main.css";
import { Await } from "vynn";
import { Router } from "vynn-router";

import { routes } from "./routes";

export const App = (props: { url: string }) => {
  return (
    <html>
      <head>
        <title>Vynn</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg"></link>
        <meta name="description" content="Vynn documentation" />
        <meta property="og:title" content="Vynn" />
        <meta property="og:description" content="Vynn documentation" />
        <meta property="og:type" content="website" />
      </head>
      <body>
        <Await>
          <Router routes={routes} url={props.url} />
        </Await>
      </body>
    </html>
  );
};
