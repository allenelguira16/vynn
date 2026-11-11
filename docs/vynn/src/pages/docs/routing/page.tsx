const RoutingPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Routing</h1>
    <p class="lead">
      Vynn routing maps a URL to a component tree. Define routes yourself with
      <code>createRouter()</code>, or let the Vite plugin build them from your app folders. Both
      approaches use the same router.
    </p>

    <h2>Choose how to define routes</h2>
    <div class="not-prose my-6 grid gap-4 md:grid-cols-2">
      <section class="rounded-box border border-base-300 p-5">
        <h3 class="mb-2 text-lg font-semibold">Route objects</h3>
        <p class="text-sm leading-6 text-base-content/70">
          Write a route tree in TypeScript. This is a good fit for small apps, embedded routers, or
          projects that prefer explicit configuration.
        </p>
        <a class="link link-primary mt-3 inline-block" href="/docs/routing/basic-routing">
          Learn route objects
        </a>
      </section>
      <section class="rounded-box border border-base-300 p-5">
        <h3 class="mb-2 text-lg font-semibold">File-based routes</h3>
        <p class="text-sm leading-6 text-base-content/70">
          Put pages and layouts in folders. The Vite plugin discovers the files and builds the route
          tree for you.
        </p>
        <a class="link link-primary mt-3 inline-block" href="/docs/routing/file-based-routing">
          Learn file-based routing
        </a>
      </section>
    </div>

    <h2>How it works</h2>
    <p>
      A route has a path and a component. When the URL changes, the router selects the most specific
      matching route and renders its component. Parent routes can render child routes through{" "}
      <code>props.children</code>.
    </p>
    <p>
      The router provides navigation and route information. It does not introduce a separate
      loading-route convention or page state machine. Use Vynn's existing async primitives inside
      the UI when a part of the page needs pending or error handling.
    </p>

    <h2>What to read next</h2>
    <ul>
      <li>
        <a href="/docs/routing/basic-routing">Basic routing</a> explains route objects and nested
        routes.
      </li>
      <li>
        <a href="/docs/routing/file-based-routing">File-based routing</a> explains the folder
        convention.
      </li>
      <li>
        <a href="/docs/routing/navigation">Navigation</a> covers links, redirects, and URL state.
      </li>
    </ul>
  </article>
);

export default RoutingPage;
