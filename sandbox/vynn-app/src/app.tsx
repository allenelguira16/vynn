import "./main.css";
import { $state, Await, onDestroy, onMount } from "vynn";
import { createRouter, Router } from "vynn-router";

import { routes } from "./routes";

export default function App(props: { url: string }) {
  const counter = $state(0);
  const router = createRouter({
    routes,
    url: props.url,
  });

  onDestroy(() => router.dispose());

  onMount(() => {
    setInterval(() => {
      counter.value++;
    }, 1000);
  });

  return (
    <html>
      <head>
        <title>Vynn SSR Sandbox {counter.value}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg"></link>
        <meta name="description" content="A server-rendered application built with Vynn." />
        <meta property="og:title" content="Vynn SSR Sandbox" />
        <meta property="og:description" content="A server-rendered application built with Vynn." />
        <meta property="og:type" content="website" />
      </head>
      <body class="overflow-hidden">
        <Await fallback={<div class="text-9xl">Page Is Loading</div>}>
          <Router router={router} />
        </Await>
      </body>
    </html>
  );
}
