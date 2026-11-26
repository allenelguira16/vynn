# render_new browser sandbox

This app uses Vynn's integrated Vite application plugin with the new renderer
selected explicitly. It does not install the legacy JSX transform or call the
renderer manually.

From the repository root:

```sh
pnpm install
pnpm --filter render-new-app dev
```

Open http://localhost:3001.

The app returns a complete `<html>` document from `src/App.tsx`. Vynn
prepares the render tree, serializes the document on the server, injects the
browser assets, then prepares the client tree before hydrating the existing
`document.documentElement`.

## Native file router

Routes live under `src/pages` and use the render_new router entry point:

- `pages/layout.tsx` provides the shared navigation and route outlet.
- `pages/page.tsx` is the keyed-list and reactive-binding playground.
- `pages/users/[id]/page.tsx` demonstrates reactive params and query values.
- `pages/async/page.tsx` demonstrates async resources and the native Await boundary.
- `pages/not-found.tsx` provides the router's fallback route.

The user page exports a `beforeLoad` guard. Navigating to `/users/0`
redirects to the playground during route preparation. The initial request path
is passed to the native router, so the same route branch is selected for SSR
and browser hydration. Route modules are lazy and the initial branch is
prepared before the server serializes the document.

## Async resources

The `render_new` entry point exports `Await`. Pass an existing async
`$state`, `$computed`, or `$store` value through its `when` prop:

```tsx
import { $computed } from "vynn";
import { Await } from "vynn/render_new";

const result = $computed(async () => {
  await fetchSomething();
  return "ready";
});

export function Page() {
  return (
    <Await when={result} fallback={<p>Loading…</p>}>
      <p>{result.value}</p>
    </Await>
  );
}
```

During SSR, tree preparation waits for the supplied resources and serializes
their resolved values into an internal hydration script. In the browser, the
fallback is reactive and the children are mounted when all supplied resources
settle. Multiple resources can be passed as an array.

The Vite config uses:

```ts
vynn({ renderer: "new", ssr: true })
```

This sandbox exercises the experimental file-router adapter, nested layouts,
lazy route loading, `Link` navigation, dynamic route params, `beforeLoad`
guards, redirects, resource-aware `Await`, full-document SSR, and hydration.

The boundary is explicit: it only tracks resources supplied through `when`.
Implicit suspension from arbitrary child reads, error boundaries, portals,
dynamic document metadata, and true streaming of unresolved render_new
components are not supported yet. The larger `sandbox/vynn-app` remains on
the legacy renderer until those runtime features can be migrated without
replacing or removing its examples.
