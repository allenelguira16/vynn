# React sandbox

This sandbox mirrors the Vynn, SolidJS 2, and Svelte 5 demo application using React 19, React Router, Vite, and a small Express SSR server.

## Run

From the repository root:

    pnpm --filter react-app dev

Build and preview the production application:

    pnpm --filter react-app build
    pnpm --filter react-app preview

The development and preview servers use port 3000.

## What it exercises

- React 19 streaming SSR and client hydration.
- Declarative routing, dynamic route params, query strings, redirects, and not-found handling.
- React.lazy, Suspense, nested Suspense boundaries, and Promise reading with use().
- Context providers, useState, derived values, and effects.
- Error Boundaries and portals.
- Forms, dropdown lists, and lazy-loaded components.
- PokéDex requests through a server-side API proxy and a Suspense-powered data example.

The app intentionally uses React's standard APIs rather than a meta-framework, so its emitted client assets can be compared with the other sandbox implementations.
