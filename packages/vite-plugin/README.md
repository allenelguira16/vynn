# Vynn Vite plugin

## Standalone server functions

Server functions can be enabled without Vynn app mode or SSR rendering:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn({ serverFunctions: true })],
});
```

Functions marked with a function-level `"use server"` directive are transformed
into RPC references in browser code. During `vite dev`, the plugin registers the
RPC endpoint as Vite middleware; no application entry, SSR renderer, or custom
development server is required.

A regular `vite build` also builds a separate server bundle when it finds
server functions in the client module graph. In standalone mode, the plugin
uses the conventional split output layout:

- `dist/client/` contains the browser build and Vite manifest.
- `dist/server/server.js` contains the server-function handler and its
  implementation chunks.

If you configure `build.outDir`, that directory is treated as the output root,
with `client/` and `server/` created inside it. The server bundle stays outside
public client assets.

`vite preview` serves the client output and automatically mounts the generated
handler at the configured endpoint, so client-side RPC calls work without app
mode or SSR rendering. The server output contains executable server code and
must be deployed only to a server-capable environment. If you use your own
production HTTP server, import `handleServerFunctionRequest` from
`server/server.js` and pass incoming requests to
`handleServerFunctionRequest(request)`.


## SSR lazy-module preloads

When `ssr: true` is enabled, Vynn annotates static `lazy(() => import("./..."))`
calls with their resolved client module IDs and records a module only when that
lazy component is reached by a server render. The client build writes
`.vite/ssr-manifest.json` automatically. Untouched lazy routes are not
preloaded merely because they exist in the module graph.

App mode wires the manifest and module tracking into its HTML response. For a
custom SSR server, use the helpers exported from `vynn/server`:

```tsx
import { readFile } from "node:fs/promises";
import {
  getSsrHead,
  getSsrModuleIds,
  renderSsrPreloadLinks,
  renderToServer,
  runWithSsrContext,
} from "vynn/server";
import App from "./app";

const ssrManifest = JSON.parse(
  await readFile("dist/client/.vite/ssr-manifest.json", "utf8"),
);
await runWithSsrContext(async () => {
  const rendered = renderToServer(() => <App />, "async");
  const modules = getSsrModuleIds();
  const html = await rendered;
  const head = getSsrHead();
  const preloadLinks = renderSsrPreloadLinks(modules, ssrManifest, {
    base: "/",
  });

  // Insert head and preloadLinks into <head>, then write html into the body.
});
```

For streaming mode, run the complete request inside `runWithSsrContext()`.
`getSsrModuleIds()` returns the request's live set. Put the first
`renderSsrPreloadLinks` result in the document head, then call it before each
emitted chunk with the same mutable `exclude` set to avoid duplicate tags. For
late discoveries, wrap the returned links with `injectSsrPreloadLinks(links)`;
this appends them to `document.head` without leaving unexpected nodes inside the
hydrated app. App mode handles the initial and late links automatically. In
development, pass `{ dev: true, base: "/" }` and a null manifest to generate
Vite module URLs instead of production asset URLs.

## Custom SSR server integration

When you own the HTTP server and build an SSR entry yourself, keep the entry
focused on rendering:

```tsx
// src/entry-server.tsx
import App from "./app";
import { renderToServer } from "vynn/server";

export function render(request: Request) {
  return renderToServer(() => <App url={request.url} />, "stream");
}
```

With `vynn({ ssr: true, serverFunctions: true })`, the plugin automatically
exposes `handleServerFunctionRequest` from the configured SSR entry during
the SSR build. You do not need to import or re-export the virtual
`virtual:vynn/server-functions` module in application code. The generated
production entry exposes both `render` and `handleServerFunctionRequest`.

The SSR build extracts the server implementations and embeds their dispatch
manifest into the same server entry graph, so you do not need to produce or
load a second standalone server-functions bundle.

In development, mounting `vite.middlewares` on your custom server is enough:
the plugin's middleware handles the RPC endpoint. In production, add a route
for `/__vynn/server-function` before your HTML fallback and forward the
incoming request to the exported handler:

```ts
const entry = await import("./dist/server/entry-server.js");
const response = await entry.handleServerFunctionRequest(webRequest);

if (response) {
  // Copy the response status and headers, then stream response.body
  // to your server's outgoing response.
  return response;
}
```

Adapt your server's incoming request to the Web `Request` API and forward the
returned Web `Response`. Keep the route ahead of the SSR HTML catch-all so
RPC POST requests are not rendered as pages. If you configure a custom
`serverFunctions.endpoint`, mount that same path on your server instead.

For Node.js HTTP servers and Express, Vynn exports `toWebRequest` from
`vynn/server/node`:

```ts
import { toWebRequest } from "vynn/server/node";

const webRequest = toWebRequest(req, {
  // Use originalUrl with Express so mounted routers preserve the full URL.
  url: req.originalUrl,
  // Configure Express trust proxy when these values come from a reverse proxy.
  origin: `${req.protocol}://${req.get("host") ?? "localhost"}`,
});

const response = await entry.handleServerFunctionRequest(webRequest);
```

For plain Node.js servers, `url` and `origin` are optional. The adapter uses
`req.url` and infers the origin from the socket and Host header by default.
Set `origin` explicitly when the externally visible protocol or host differs
from the connection seen by Node. Bun's and Deno's native servers already
provide Web `Request` objects, so they do not need this adapter.


This initial implementation does not serialize captured lexical variables.
Pass values the server function needs as arguments.

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

Vynn's SSR runtime injects the head patch bootstrap into streaming output and
emits browser-side patches whenever a later async boundary registers metadata.
The app-mode handler handles document assembly automatically. For a custom SSR
document, insert the initial head snapshot into the document and preserve the
streamed body chunks:

```tsx
import { getSsrHead, renderToServer, runWithSsrContext } from "vynn/server";
import App from "./app";

await runWithSsrContext(async () => {
  const rendered = renderToServer(() => <App />, "stream");
  const head = getSsrHead();

  // Insert head into the document's <head>, then stream rendered into the body.
  // The stream includes Vynn's patch bootstrap and any later head updates.
});
```

The custom document renderer does not need to subscribe to head changes or
generate its own head-patch scripts. It must pass the stream chunks through
unchanged so the browser can execute Vynn's patch scripts.
