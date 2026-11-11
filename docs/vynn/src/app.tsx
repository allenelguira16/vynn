import "./main.css";
import { Await, onDestroy } from "vynn";
import { createRouter, Router, toFileRouter } from "vynn-router";

export const App = (props: { url: string }) => {
  const router = createRouter({
    routes: toFileRouter("/src/pages"),
    url: props.url,
  });

  onDestroy(() => router.dispose());

  return (
    <html lang="en">
      <head>
        <title>Vynn documentation</title>
        <link rel="icon" type="image/svg+xml" href="/vynn-logo.webp"></link>
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
          <Router router={router} />
        </Await>
      </body>
    </html>
  );
};
