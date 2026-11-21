# Svelte 5 sandbox

This sandbox mirrors the application demos in `sandbox/vynn-app` and
`sandbox/solidjs2-app` using Svelte 5 with SvelteKit.

SvelteKit provides file-based routing, server-side rendering, hydration, and
server endpoints. The UI examples use Svelte 5 runes (`$state`, `$derived`),
component context, await blocks, and `<svelte:boundary>`.

## Run

From the repository root:

```sh
pnpm --filter svelte5-app dev
```

Build and preview:

```sh
pnpm --filter svelte5-app build
pnpm --filter svelte5-app preview
```

The dev and preview servers use port `3000`.

## What it exercises

- SSR and client hydration through SvelteKit.
- File-based routes, dynamic route parameters, query-string updates, redirects, and 404 handling.
- Svelte 5 runes, shared reactive state, and derived values.
- Component context with independent provider instances.
- Lazy component loading and route-level code splitting.
- `{#await}` blocks and nested async content.
- `<svelte:boundary>` component error handling and SvelteKit route errors.
- A DOM portal action.
- A server-side PokéAPI endpoint used by both PokéDex examples.

## Notes

Svelte does not ship an application router. This sandbox uses SvelteKit rather
than adding a third-party router so routing and SSR use Svelte's official app
framework. The PokéAPI example calls a local SvelteKit endpoint; it does not
enable experimental remote functions. Svelte's experimental async compiler
option is enabled for further async experiments.
