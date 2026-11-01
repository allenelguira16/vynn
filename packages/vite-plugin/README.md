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
      serverFunctions: true,
    }),
  ],
});
```

Calling `vynn()` without options creates a client-rendered application.
Enable `ssr: true` for server rendering, streaming, automatic hydration,
lazy-module preloads, and a generated request handler.

Vynn uses conventional entry names and document defaults. A root component is
discovered from `src/App.*` or `src/app.*`. Projects can provide conventional
`src/entry-client.*` and `src/entry-server.*` files to customize their entries.

With SSR enabled, Vynn:

- Runs SSR in development and builds the client and server environments.
- Generates the document response and streams SSR output by default.
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
import express from "express";
import compression from "compression";
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
