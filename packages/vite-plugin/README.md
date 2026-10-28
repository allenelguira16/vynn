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


## Custom SSR server integration

When you own the HTTP server and build an SSR entry yourself, import the
virtual handler in that entry and export it alongside your renderer:

```tsx
// src/entry-server.tsx
import { handleServerFunctionRequest } from "virtual:vynn/server-functions";

export { handleServerFunctionRequest };

// Keep your existing render(url) export here.
```

Use `vynn({ ssr: true, serverFunctions: true })` in your Vite config. The
SSR build extracts the server implementations and embeds their dispatch
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
