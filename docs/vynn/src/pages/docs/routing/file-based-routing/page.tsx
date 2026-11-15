import { CodeBlock } from "../../../../components/code-block";

const FileBasedRoutingPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>File-based routing</h1>
    <p class="lead">
      The file router builds the same route tree from your app directory. Folders define URL
      segments, and special files define pages, layouts, and not-found UI.
    </p>

    <h2>Set up the app directory</h2>
    <p>
      Register <code>vite-plugin-vynn</code> in your Vite config. The plugin transforms the
      one-argument <code>toFileRouter()</code> call and discovers route files for you.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn({ ssr: true })],
});`}
    />
    <p>
      Create a route directory and pass its root-relative path to <code>toFileRouter()</code>. You
      do not need to write an <code>import.meta.glob()</code> call yourself.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { Router, toFileRouter } from "vynn-router";

const routes = toFileRouter("/src/app");

export function App(props: { url: string }) {
  return <Router routes={routes} url={props.url} />;
}`}
    />

    <h2>Special files</h2>
    <div class="not-prose my-6 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>File</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>page.tsx</code>
            </td>
            <td>Defines the page for its folder's URL.</td>
          </tr>
          <tr>
            <td>
              <code>layout.tsx</code>
            </td>
            <td>Wraps the pages and nested routes in its folder.</td>
          </tr>
          <tr>
            <td>
              <code>not-found.tsx</code>
            </td>
            <td>Defines fallback UI for unmatched routes in its scope.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Example directory</h2>
    <CodeBlock
      lang="bash"
      code={`src/app/
├── layout.tsx
├── page.tsx
├── not-found.tsx
├── about/
│   └── page.tsx
└── blog/
    ├── layout.tsx
    ├── page.tsx
    └── [slug]/
        └── page.tsx`}
    />
    <p>
      The files above define <code>/</code>, <code>/about</code>, <code>/blog</code>, and
      <code>/blog/:slug</code>. The root layout wraps the application, while the blog layout wraps
      only routes inside the blog folder.
    </p>

    <h2>Run a guard from a route module</h2>
    <p>
      A page or layout module can export a named <code>beforeLoad</code> function alongside its
      default component. The Vite plugin detects that export and connects it to the route, so you
      do not need to define the same guard in a separate route-object list. The guard receives the
      same context, location, params, search values, and abort signal as an object-defined route.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { redirect, type BeforeLoadContext } from "vynn-router";

export async function beforeLoad({ params, signal }: BeforeLoadContext) {
  const response = await fetch("/api/users/" + params.id, { signal });
  if (response.status === 404) redirect("/users");
}

export default function UserPage() {
  return <h1>User profile</h1>;
}`}
    />
    <p>
      Guards run when the matched route view is created. A parameter or query-string change on an
      already-mounted route does not rerun the guard; use the reactive <code>$params</code> and
      <code>$search</code> values for UI that must respond to those changes. See{" "}
      <a href="/docs/routing/guards-and-redirects">Route guards and redirects</a>.
    </p>

    <h2>Keep route files focused</h2>
    <p>
      Put reusable components, utilities, and other non-route code in ordinary files. Only
      <code>page</code>, <code>layout</code>, and <code>not-found</code> files become routes.
      Folders whose names start with an underscore are private and are excluded from routing.
    </p>
    <p>
      Continue with <a href="/docs/routing/layouts">Layouts</a> for nested UI, or
      <a href="/docs/routing/dynamic-routes">Dynamic routes</a> for parameterized URLs.
    </p>
  </article>
);

export default FileBasedRoutingPage;
