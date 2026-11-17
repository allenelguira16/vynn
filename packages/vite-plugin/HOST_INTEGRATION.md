# Vynn deployment integrations

Vynn follows Vite's Environment API so deployment plugins can consume its SSR build directly.

## Standard setup

Vynn configures the browser environment and a server environment named `ssr`. The server environment uses `consumer: "server"` and builds a Fetch-compatible service:

- `handleRequest(request: Request): Promise<Response>`
- Default export: `{ fetch(request): Promise<Response> }`

The server entry is registered as the `index` service entry. This is the convention used by deployment integrations such as Nitro.

No deployment-provider option is required:

```ts
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [
    vynn({ ssr: true }),
    nitro(),
  ],
});
```

Other Vite deployment plugins can consume the same `ssr` environment. For example, a Worker integration can target the environment by name:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [
    vynn({ ssr: true }),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
  ],
});
```

The exact options and plugin ordering are owned by each deployment integration. Vynn does not select a deployment preset or inspect provider names.

## Environment ownership

Vynn owns framework work:

- JSX compilation and hydration.
- Client and SSR environment configuration.
- Application rendering and document generation.
- The Fetch-compatible SSR service.
- Server-function handling when enabled.

The deployment plugin owns:

- Runtime selection and startup.
- Incoming request dispatch.
- Asset packaging and serving.
- Deployment-specific output and presets.
- Static prerendering and route crawling.

During development, Vynn checks whether the `ssr` environment is runnable by Vite. If it has a Vite module runner, Vynn installs its normal development request middleware. If a deployment plugin supplies a non-runnable environment, Vynn leaves request dispatch to that integration automatically. CSS collection remains available to the server environment.

For production preview and the optional Node transport artifact, Vynn also detects deployment integrations by their Vite build hooks or custom server environments. In that case, it leaves preview/runtime packaging to the deployment plugin and does not emit a competing Node-only server entry.

## Build behavior

Vynn enables Vite's multi-environment builder and registers its SSR service as the `ssr` environment's `index` entry. It does not build environments from its own early `buildApp` hook. Vite's builder or the deployment plugin's build orchestrator owns environment scheduling and output preparation.

The client build emits the standard Vite manifest and SSR manifest. Vynn uses those manifests to resolve the client entry, stylesheets, and preload assets. The generated SSR handler does not import deployment-specific asset modules such as Nitro's `?assets` imports.

Deployment plugins may customize environment output directories through Vite's `configEnvironment` hook.

## Development and preview

A custom integration that needs the runnable Vite SSR handler can use:

```ts
import {
  handleVynnDevRequest,
  loadVynnSsrHandler,
} from "vite-plugin-vynn";

const response = await handleVynnDevRequest(server, request);

// Or load the handler when custom CSS handling is required.
const handler = await loadVynnSsrHandler(server);
const responseWithoutCollectedCss = await handler.handleRequest(request);
```

For a deployment-owned, non-runnable SSR environment, the deployment plugin is responsible for forwarding requests to its SSR service. Vynn does not install competing development middleware in that environment.

## Static generation and server functions

Vynn renders an incoming request to a standard Fetch `Response`. The deployment host decides which URLs to render, how to crawl links, where to write static files, and which preset to use.

A static deployment does not provide a server runtime for later server-function RPC requests. Choose a runtime deployment when server functions must remain callable after deployment.
