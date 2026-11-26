# Vynn Router

## File-based routing

Vynn's file router follows the folder-first organization used by the Next.js App
Router. Folders define URL segments, `page` files make a folder publicly
routable, and `layout` files wrap the pages and nested layouts below them.

```tsx
// src/routes.ts
import { toFileRouter } from "vynn-router";

export const routes = toFileRouter("/src/app");
```

Register the normal `vynn()` plugin in `vite.config.ts`. It includes the
file-router transform, so no additional plugin or router instance API is
needed.

### Project structure

```text
src/
  app/
    layout.tsx
    page.tsx
    about/
      page.tsx
    dashboard/
      layout.tsx
      page.tsx
      settings/
        page.tsx
    blog/
      [slug]/
        page.tsx
    (marketing)/
      layout.tsx
      pricing/
        page.tsx
    _components/
      site-header.tsx
  routes.ts
```

This structure creates `/`, `/about`, `/dashboard`,
`/dashboard/settings`, `/blog/:slug`, and `/pricing`.

Only `page` and `layout` files are special to the file router. Other files
can be colocated with a route without accidentally becoming routes. A folder
without a `page` is not directly accessible, but its child folders can still
contain pages.

### Pages

A `page.tsx` file defines the UI for its folder's URL. It must have a default
component export:

```tsx
// src/app/blog/[slug]/page.tsx
export default function BlogPostPage() {
  return <article>Blog post</article>;
}
```

The page module is loaded with Vynn's `lazy()`. It is not eagerly imported
just because the route table is created.

## Navigation lifecycle

The router compiles route patterns when `createRouter()` is called. Each
navigation resolves one complete route branch from that compiled tree. Lazy
modules in the destination branch are loaded before the new branch is
published to the renderer.

Until the destination is ready, the previously committed route remains
mounted. Once the branch changes, nested outlets update independently, so
layouts whose route identity has not changed keep their component owners.
Already-loaded lazy modules do not introduce an asynchronous preload step.

### Layouts

A `layout.tsx` file wraps the page and nested routes in its folder. Layouts
are nested in the same order as their folders. They receive the route outlet
through `props.children`:

```tsx
// src/app/dashboard/layout.tsx
import type { PropsWithChildren } from "vynn";

export default function DashboardLayout(props: PropsWithChildren) {
  return (
    <section>
      <DashboardSidebar />
      <main>{props.children}</main>
    </section>
  );
}
```

The root `layout.tsx` wraps the whole route tree. It is optional in Vynn
because the application entry can already own the document shell; when the
file is omitted, the router uses an invisible outlet.

Next.js requires a root layout for each root route tree. It can define multiple
root layouts through route groups, but navigating between those roots causes a
full document load. Vynn keeps navigation client-side between route groups,
even when they have different layouts.

A layout can exist in a folder that has no `page.tsx`. It still wraps
descendant pages, but does not make its own URL publicly accessible.

### Dynamic segments

Use bracketed folder names for dynamic URL segments:

| Folder                 | Route                    |
| ---------------------- | ------------------------ |
| `[slug]/page.tsx`      | `:slug`                  |
| `[...slug]/page.tsx`   | Required catch-all, `*`  |
| `[[...slug]]/page.tsx` | Optional catch-all, `*?` |

Dynamic parameters are available through the existing router params API.
Catch-all parameters use the existing `params["*"]` key.

### Route groups

Parenthesized folders organize routes without adding a URL segment:

```text
app/
  (marketing)/
    layout.tsx
    pricing/
      page.tsx
  (dashboard)/
    layout.tsx
    dashboard/
      page.tsx
```

The routes are `/pricing` and `/dashboard`. Each group's layout applies
only to routes inside that group. Multiple groups at the same folder depth
are selected by checking which descendant route matches the current URL.
Two page files that resolve to the same public URL are rejected.

### Private folders

A folder whose name starts with an underscore is excluded from route
discovery, including all of its descendants:

```text
app/
  _components/
    button.tsx
    modal.tsx
  account/
    page.tsx
```

The private folder is useful for colocating implementation details that should
not be part of the route tree. Ordinary helper files are also ignored, whether
or not they are inside a private folder.

### Route guards

A page or layout can export a named `beforeLoad` function alongside its
default component. Both function declarations and variable declarations are
detected:

```tsx
// src/app/users/[id]/page.tsx
import { redirect, type BeforeLoadContext } from "vynn-router";

type AppContext = {
  tenant: string;
};

export async function beforeLoad({ context, params, signal }: BeforeLoadContext<AppContext>) {
  const user = await getUser(context.tenant, params.id, { signal });

  if (!user) {
    redirect("/users");
  }
}

export default function UserPage() {
  return <main>User profile</main>;
}
```

Or:

```tsx
export const beforeLoad = async ({ params, search, signal }) => {
  // Validate the route entry before rendering the page.
};

export default function SearchPage() {
  return <main>Search</main>;
}
```

Routes without a named `beforeLoad` export do not get a guard. When a page
guard exists, its page module is imported before the page renders. A layout
guard runs at the layout boundary before its descendant route renders. In
either case, the same module promise is reused by the lazy component.

The guard receives the existing router context: `context`, `location`,
`params`, `search`, and `signal`. Its return value is not stored as route
data. Use router context or a Vynn reactive resource for shared values.

### Router instance

File-based routes use the same router instance API as manually defined routes:

```tsx
import { onDestroy } from "vynn";
import { createRouter, Router } from "vynn-router";

import { routes } from "./routes";

export default function App(props: { url: string }) {
  const router = createRouter({
    routes,
    url: props.url,
  });

  onDestroy(() => router.dispose());

  return <Router router={router} />;
}
```

Use a path relative to the module containing `toFileRouter()`, such as
`"./app"`, or a Vite-root-relative path such as `"/src/app"`.


## Experimental `render_new` adapter

The new renderer has a separate router entry point. It reuses the router's
route matcher, history, and reactive location state, but uses native
`render_new` component descriptors and child bindings instead of the legacy
VNode outlet.

Import from `vynn-router/render_new` when Vite is configured with
`vynn({ renderer: "new" })`. Route components must be compiled for the new
renderer as well:

```tsx
import { Router, type Route } from "vynn-router/render_new";

import HomePage from "./pages/home";
import UserPage from "./pages/user";
import DashboardLayout from "./pages/dashboard-layout";
import SettingsPage from "./pages/settings";

const routes: Route[] = [
  { path: "/", component: HomePage },
  {
    path: "/dashboard",
    component: DashboardLayout,
    children: [
      { path: "settings", component: SettingsPage },
    ],
  },
  { path: "/users/:id", component: UserPage },
];

export default function App() {
  return <Router routes={routes} />;
}
```

The adapter supports eager and lazy route components, nested layouts
through `props.children`, reactive `$params` and `$search`, `Link`
navigation, configured `notFound` components, and page/layout
`beforeLoad` guards. It keeps an unchanged parent route mounted when
navigation changes only a deeper route.

Guards receive the same `context`, `location`, `params`, `search`, and
`signal` fields as the legacy router. A guard reruns when the current
pathname or query string changes, aborts its previous signal, and only commits
the result of the latest run. Client redirects use the existing `redirect()`
API. Lazy modules share a load promise, display an empty range while the
initial module is loading, and can be preloaded before a route transition.

Route components can use the existing reactive route facades:

```tsx
import { $params, $search } from "vynn-router/render_new";

export default function UserPage() {
  return <p>User {$params.id}, tab {$search.tab}</p>;
}
```

Use the matching `Link` export from the same entry point:

```tsx
import { Link } from "vynn-router/render_new";

export function UserNavigation() {
  return <Link href="/users/42" activeClass="active">Open user</Link>;
}
```

This is an experimental integration, not a complete router migration.
The `toFileRouter()` transform also recognizes imports from
`vynn-router/render_new` and uses the native lazy component runtime for its
page and layout modules. The `lazy()` export is available when defining lazy
routes manually.

The initial route branch supports SSR and hydration when the app uses the
integrated Vite plugin with `renderer: "new"` and `ssr: true`. The generated
server and client entries call `prepareRenderNewTree()` before serializing
or hydrating. Router preparation preloads lazy modules and awaits each
matched route's `beforeLoad` guard. Client redirects during preparation
resolve before hydration; subsequent client navigations continue to run
guards with abortable signals.

The new serializer remains synchronous after preparation. General async
resources, `Await` boundaries, and true streaming of unresolved
render_new components are not supported by this initial SSR integration.


The existing `vynn-router` entry point remains unchanged and continues to
provide the legacy renderer integration. Do not mix its `Router` or `Link`
components into a `render_new` route tree.

### Current scope

The file router currently implements `page.tsx`, `layout.tsx`, dynamic
segments, catch-all segments, route groups, private folders, and
page- and layout-level `beforeLoad`.

Other Next.js special files such as `loading.tsx`, `error.tsx`,
`not-found.tsx`, `template.tsx`, and `route.ts` are not interpreted yet;
they remain ordinary colocated files.

Parallel route slots (for example, `@modal`) and intercepting route folders
(for example, `(.)photo`) are not implemented yet. The Vite transform reports
an explicit error when it encounters those folder conventions instead of
silently treating them as regular URL segments.
