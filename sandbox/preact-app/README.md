# Preact sandbox

A Preact 11 implementation of the application examples in `sandbox/vynn-app`. It uses the same Tailwind 4 and DaisyUI styling, page navigation, template layout, and examples, with Preact Hooks, Context, Suspense, and preact-iso equivalents.

## Run

From the repository root:

```sh
pnpm --filter preact-app dev
```

The development server listens on port 3001.

Build and preview the production application:

```sh
pnpm --filter preact-app build
pnpm --filter preact-app preview
```

## What it exercises

- A shared page layout, DaisyUI sidebar menu, template cards, and portal content.
- Lazy-loaded components and nested lazy imports.
- Forms, state, derived values, and shared context.
- Dynamic dropdown lists with sorting, randomization, and mount/unmount behavior.
- Component errors and retryable error boundaries.
- Suspense boundaries, including nested and stacked async work.
- PokéDex pagination and sorting, with both effect-driven and Suspense-driven data loading.
- Route parameters, query strings, redirects, and not-found handling.
- Client hydration and streaming server rendering.

The application uses Preact 11, `preact-iso`, and Vite's built-in Oxc JSX transform. No E2E setup is included.
