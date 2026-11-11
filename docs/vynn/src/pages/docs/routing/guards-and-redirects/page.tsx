import { CodeBlock } from "../../../../components/code-block";

const GuardsAndRedirectsPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Route guards and redirects</h1>
    <p class="lead">
      Add <code>beforeLoad</code> to a route when it must check something before its component
      renders. Use <code>redirect()</code> to send the user to another URL.
    </p>

    <h2>Run a route guard</h2>
    <p>
      A guard receives the router context, current location, matched parameters, query parameters,
      and an <code>AbortSignal</code>. It can be synchronous or asynchronous.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { redirect, type Route } from "vynn-router";

type AppContext = {
  user?: { id: string };
};

const routes: Route<AppContext>[] = [
  {
    path: "/account",
    beforeLoad: ({ context }) => {
      if (!context.user) {
        redirect("/login");
      }
    },
    component: AccountPage,
  },
];`}
    />

    <h2>Provide router context</h2>
    <p>
      Pass values to <code>createRouter()</code> through <code>context</code>. Each guard receives
      the same context value for that router instance. In an SSR app, also pass the request URL as
      shown in <a href="/docs/routing/basic-routing">Basic routing</a>.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { createRouter } from "vynn-router";

const router = createRouter({
  routes,
  context: {
    user: getCurrentUser(),
  },
});`}
    />

    <h2>Redirect to another route</h2>
    <p>
      <code>redirect()</code> stops the current route from rendering and redirects to the target.
      It works during server rendering and client navigation. You can provide a redirect status
      for the server response.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { redirect } from "vynn-router";

beforeLoad: ({ context }) => {
  if (!context.user) {
    redirect("/login", { status: 307 });
  }
},`}
    />
    <p>
      Supported redirect statuses are <code>301</code>, <code>302</code>, <code>303</code>,
      <code>307</code>, and <code>308</code>. The default is <code>302</code>.
    </p>

    <h2>Understand guard timing</h2>
    <p>
      A guard runs when its matched route view is created. It does not re-run just because a
      parameter or query string changes while that same route component remains mounted. Use a
      reactive value in the page when the UI needs to respond to those changes.
    </p>
    <p>
      An asynchronous guard must settle before its route component renders. If it is abandoned
      because navigation changes, its signal is aborted. Keep guards focused on route-entry checks;
      fetch and display page data with Vynn's normal async UI primitives.
    </p>
  </article>
);

export default GuardsAndRedirectsPage;
