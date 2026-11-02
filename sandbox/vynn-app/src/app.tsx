import { $state, onMount } from "vynn";
import { Router } from "vynn-router";

import { routes } from "./routes";

export default function App(props: { url: string }) {
  const counter = $state(0);

  onMount(() => {
    setInterval(() => {
      counter.value++;
    }, 1000);
  });

  return (
    <html>
      <head>
        <title>Vynn SSR Sandbox {counter.value}</title>
        <meta name="description" content="A server-rendered application built with Vynn." />
        <meta property="og:title" content="Vynn SSR Sandbox" />
        <meta property="og:description" content="A server-rendered application built with Vynn." />
        <meta property="og:type" content="website" />
      </head>
      <body>
        <div id="app">
          <Router routes={routes} url={props.url} />
        </div>
      </body>
    </html>
  );
}
