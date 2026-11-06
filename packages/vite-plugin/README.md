# Vynn Vite plugin

## Application integration

The Vynn Vite plugin is the application integration. App handling is enabled
by default: `vynn()` discovers the conventional application entry, generates
the client entry and document shell, and serves the application in development
and production. There is no `app: true` flag.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [
    vynn({
      ssr: true,
      ssrMode: "async",
      serverFunctions: true,
    }),
  ],
});
```

Calling `vynn()` without options creates a client-rendered application.
Enable `ssr: true` for server rendering, automatic hydration, lazy-module
preloads, and a generated request handler. The SSR render mode is configured
with `ssrMode`, which accepts `"sync"`, `"async"`, or `"stream"`. It defaults
to `"stream"`.

Vynn discovers the root component from `src/App.*` or `src/app.*`.
The root component owns the complete HTML document, including `<html>`,
`<head>`, and `<body>`. The plugin injects development resources and CSS
imported by the application, preloads, and the generated client entry into that
document. Stylesheets are explicit: import them from the root component or
another module in its import graph. Vynn does not infer stylesheet paths. Projects can provide conventional `src/entry-client.*` and `src/entry-server.*` files to
customize their entries.

An authored `src/entry-server.*` may export an async `render(url, mode)`
function. The plugin passes the configured `ssrMode` as its second argument,
so custom entries can use the same mode as generated entries:

```tsx
import type { RenderMode } from "vynn";
import { renderToServer } from "vynn/server";

export async function render(url: string, mode: RenderMode) {
  const data = await loadPageData(url);

  return renderToServer(() => App({ url, data }), mode);
}
```

Every `renderToServer()` call creates one independent root Owner and returns
an explicit result containing `body`, `head`, and `modules`. The head manager
provides `render()` for the initial document head and `subscribe()` for
subsequent metadata changes during streaming. The module set remains live while
the stream resolves lazy boundaries. The generated request handler consumes
these values directly; no request-scoped Owner or async context wrapper is
needed.

```tsx
// src/app.tsx
import "./styles.css";

export default function App() {
  return (
    <html>
      <head>
        <title>My Vynn app</title>
        <meta name="description" content="A Vynn application." />
      </head>
      <body>
        <main id="app">Hello from Vynn</main>
      </body>
    </html>
  );
}
```

The generated client entry targets the `Document` directly. With SSR enabled,
Vynn hydrates the existing `<html>` tree instead of mounting into a generated
container. In client-only mode, the initial shell is replaced by the document
returned from the root component while preserving plugin and Vite resources.

During development with SSR enabled, changing the root App module restarts
the Vite dev server. This recreates the client and SSR module environments so
the next document response uses the updated App. The browser reconnects to the
restarted Vite server and reloads the page.

With SSR enabled, Vynn:

- Runs SSR in development and builds the client and server environments.
- Generates the document response using the configured `ssrMode` (default: `"stream"`).
- Hydrates the application automatically in the browser.
- Tracks lazy modules and injects their required preload assets.
- Handles server-function requests when `serverFunctions` is enabled.
- Emits a Fetch-compatible handler and a Node adapter for custom servers.

## Custom Node server

The integrated application does not require Vite's development or preview
server. The generated Node adapter can be mounted in Express or another Node
HTTP server.

### Express development server

Vite can run in middleware mode while Vynn handles application requests:

```ts
import express from "express";
import { createServer } from "vite";

const app = express();
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});

app.use(vite.middlewares);
app.listen(3000);
```

### Express production server

The SSR app build emits:

- `dist/client/` for browser assets.
- `dist/server/index.js` with the universal `handleRequest(request)` handler.
- `dist/server/node.js` with `listener`, `createListener(options)`, and
  `handleRequest` Node exports.

Serve static assets before mounting the generated Node listener:

```ts
import compression from "compression";
import express from "express";
import sirv from "sirv";

import { listener } from "./dist/server/node.js";

const app = express();

app.use(compression(), sirv("./dist/client", { extensions: [] }));
app.use(listener);

app.listen(3000);
```

Mount the listener before request-body parsers so server-function POST bodies
remain available to Vynn. The listener adapts Node requests to Web Requests and
streams the returned Web Responses. It does not own your HTTP server, middleware,
or unrelated routes.

The universal handler can also be used directly by Bun, Deno, or another
Fetch-based server:

```ts
import { handleRequest } from "./dist/server/index.js";

const response = await handleRequest(request);
```

## Server functions

Server functions are optional. Enable them with `serverFunctions: true`:

```ts
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn({ serverFunctions: true })],
});
```

Functions marked with a function-level `"use server"` directive are
transformed into RPC references in browser code. During `vite dev`, the plugin
registers the RPC endpoint as Vite middleware.

A regular `vite build` emits `dist/client` plus
`dist/server/server.js` for the server-function handler. Vite preview mounts
that handler automatically. In a custom production server, import
`handleServerFunctionRequest` from `server/server.js` and pass incoming Web
Requests to it.

## JSX document metadata

Vynn automatically hoists native JSX `<title>`, `<meta>`, and `<link>`
elements into the document head. They can be declared at the application root
or inside nested components:

```tsx
function BlogPost(props: { title: string; description: string; url: string }) {
  return (
    <article>
      <title>{props.title}</title>
      <meta name="description" content={props.description} />
      <meta property="og:title" content={props.title} />
      <link rel="canonical" href={props.url} />
      <h1>{props.title}</h1>
    </article>
  );
}
```

The elements are owned by the component that declares them. When that
component is disposed, its metadata is removed and any previous registration
for the same metadata identity becomes active again. Reactive attributes and
title children update normally.

The compiler keeps `<meta itemProp>` and `<link itemProp>` in their original
DOM position, and does not hoist head tags written inside an SVG subtree.
