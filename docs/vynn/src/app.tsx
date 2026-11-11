import "./main.css";
import { Await } from "vynn";
import { Router } from "vynn-router";

import { routes } from "./routes";

export const App = (props: { url: string }) => {
  return (
    <html lang="en">
      <head>
        <title>Vynn documentation</title>
        <meta
          name="description"
          content="Learn Vynn, a TypeScript UI framework built around JSX and fine-grained reactivity."
        />
        <meta property="og:title" content="Vynn documentation" />
        <meta
          property="og:description"
          content="Guides and API references for building applications with Vynn."
        />
        <meta property="og:type" content="website" />
      </head>
      <body>
        <Await fallback={<main class="p-8">Loading documentation...</main>}>
          <Router routes={routes} url={props.url} />
        </Await>
      </body>
    </html>
  );
};
