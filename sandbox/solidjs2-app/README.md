# SolidJS 2 SSR sandbox

This sandbox mirrors the custom-server shape of `sandbox/vynn-ssr` using
SolidJS 2 and the `@solidjs/vite-plugin` API.

It deliberately uses manual SSR mode (`ssr: true`, without `start`) so the
example owns its Express server, Vite dev middleware, HTML shell, SSR entry,
and production server-function RPC route. Solid's integrated `start` mode
handles more of this automatically, but would hide the entry-point behavior
this sandbox is meant to compare.

## Run

Requires Node.js 22.12 or newer.

From the repository root, install the workspace dependencies and start dev:

```sh
pnpm install
pnpm --dir sandbox/solidjs2-ssr dev
```

Build and run the production server:

```sh
pnpm --dir sandbox/solidjs2-ssr build
pnpm --dir sandbox/solidjs2-ssr start
```

The sandbox uses port 5174 in development and 4174 in production so it can run
beside `sandbox/vynn-ssr`.

## What it exercises

- Manual SSR using `renderToStream` and `virtual:solid-manifest`.
- Client hydration with a reactive counter.
- A function marked with `"use server"`, dispatched through
  `virtual:solid-server-function-handler`.
- Nested lazy loading: visit `/lazy` to test an async route, separate sibling
  lazy components, and a third-level lazy component with its own `Loading`
  boundary.

## The entry-point contract

In custom-server mode, `src/entry-server.tsx` intentionally imports and
re-exports `handleServerFunctionRequest`. The outer Express server imports the
production SSR bundle once and calls that handler for `/_server` requests
before its HTML fallback. In development, Vite middleware owns the RPC
endpoint so the outer server does not load the production handler.
