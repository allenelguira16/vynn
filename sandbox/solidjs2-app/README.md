# SolidJS 2 sandbox

This sandbox mirrors the application demos in `sandbox/vynn-app` using
SolidJS 2 and the `@solidjs/vite-plugin` integrated application mode.

It uses Solid's own reactive primitives, router, async boundaries, and
server-function transform. The two sandboxes share the same demo scenarios,
while keeping their framework-specific implementations independent.

## Run

From the repository root:

```sh
pnpm --filter solid-app dev
```

Build and preview the production application:

```sh
pnpm --filter solid-app build
pnpm --filter solid-app preview
```

The preview runs on port `3000`.

## What it exercises

- SSR and client hydration.
- Route coverage using Solid Router's route configuration.
- Lazy-loaded pages and nested loading boundaries.
- Context providers, stores, signals, and computed values.
- Error boundaries and a not-found route.
- Dynamic route parameters, query-string updates, and redirects.
- Server functions for PokéAPI requests.
- Portals and shared application layout.
