import { CodeBlock } from "../../../../components/code-block";

const NotFoundPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Not found</h1>
    <p class="lead">
      Render a fallback component when a URL does not match a page. Use the router's
      <code>notFound</code> option with route objects, or add a <code>not-found.tsx</code> file
      with file-based routing.
    </p>

    <h2>Route objects</h2>
    <p>
      Pass a component to <code>notFound</code>. The router renders it when no route matches.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { onDestroy } from "vynn";
import { createRouter, Router } from "vynn-router";

import { routes } from "./routes";
import NotFoundPage from "./NotFoundPage";

export function App(props: { url: string }) {
  const router = createRouter({
    routes,
    url: props.url,
    notFound: NotFoundPage,
  });

  onDestroy(() => router.dispose());

  return <Router router={router} />;
}`}
    />

    <h2>File-based routes</h2>
    <p>
      Add <code>not-found.tsx</code> to your app directory. A root file handles unmatched routes
      throughout the app. A file inside a route folder handles unmatched routes within that
      segment.
    </p>
    <CodeBlock
      lang="bash"
      code={`src/app/
├── not-found.tsx
├── page.tsx
└── blog/
    ├── not-found.tsx
    └── page.tsx`}
    />
    <p>
      For example, <code>blog/not-found.tsx</code> handles an unknown path under
      <code>/blog</code>. An explicitly declared catch-all page takes precedence over the
      not-found fallback.
    </p>

    <h2>Keep the fallback simple</h2>
    <CodeBlock
      lang="tsx"
      code={`export default function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <a href="/">Return home</a>
    </main>
  );
}`}
    />
    <p>
      The router selects fallback UI; it does not currently set the HTTP response status to
      <code>404</code> automatically. Set the response status in your server integration if your
      application needs an HTTP 404 response.
    </p>
  </article>
);

export default NotFoundPage;
