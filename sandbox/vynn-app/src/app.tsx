import "./main.css";
import { $state, Await, onDestroy, onMount } from "vynn";
// import { createRouter, Router, toFileRouter } from "vynn-router";

import { ComponentError } from "./pages/component-error";
import { Contexts } from "./pages/context";
import { Dropdowns } from "./pages/dropdown-list";
import { Forms } from "./pages/forms";
import { Lazy } from "./pages/lazy";
import { NonAsyncSuspense } from "./pages/non-async-suspense";
import { PokeDex } from "./pages/poke-dex";
import { PokeDexAwait } from "./pages/poke-dex-await";
import { StackedSuspense } from "./pages/stacked-suspense";

export default function App(props: { url: string }) {
  const counter = $state(0);
  // const router = createRouter({
  //   routes: toFileRouter("/src/app"),
  //   url: props.url,
  // });

  // onDestroy(() => router.dispose());

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
      <body>
        <Lazy />
        <Forms />
        <Contexts />
        <Dropdowns />
        <ComponentError />
        <NonAsyncSuspense />
        <PokeDex />
        <PokeDexAwait />
        <StackedSuspense />
        {/* <Await fallback={<div class="text-9xl">Page Is Loading</div>}>
          <Router router={router} />
        </Await> */}
      </body>
    </html>
  );
}
