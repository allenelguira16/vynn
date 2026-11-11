import { CodeBlock } from "../../../../components/code-block";

const BasicRoutingPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Basic routing</h1>
    <p class="lead">
      Define routes as objects with a <code>path</code> and a <code>component</code>. Pass the
      route list to <code>Router</code> to render the page that matches the current URL.
    </p>

    <h2>Define a route list</h2>
    <CodeBlock
      lang="tsx"
      code={`import { Router, type Route } from "vynn-router";

import { HomePage } from "./pages/home";
import { AboutPage } from "./pages/about";

const routes: Route[] = [
  { path: "/", component: HomePage },
  { path: "/about", component: AboutPage },
];

export function App(props: { url: string }) {
  return <Router routes={routes} url={props.url} />;
}`}
    />
    <p>
      <code>url</code> supplies the initial request URL. In an app rendered by the Vynn Vite
      plugin, the root component receives it as <code>props.url</code>. Passing it to the router
      keeps the server render aligned with the requested page.
    </p>

    <h2>Nest routes under a layout</h2>
    <p>
      A route can have <code>children</code>. Its component becomes the parent for those routes and
      must render <code>props.children</code> where the matched child should appear.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import type { PropsWithChildren } from "vynn";
import { Router, type Route } from "vynn-router";

import { HomePage } from "./pages/home";
import { AboutPage } from "./pages/about";

function AppLayout({ children }: PropsWithChildren) {
  return (
    <div>
      <header>My application</header>
      <main>{children}</main>
    </div>
  );
}

const routes: Route[] = [
  {
    path: "/",
    component: AppLayout,
    children: [
      { path: "/", component: HomePage },
      { path: "about", component: AboutPage },
    ],
  },
];

export function App(props: { url: string }) {
  return <Router routes={routes} url={props.url} />;
}`}
    />
    <p>
      The parent path is combined with each child path. Here, the child route <code>about</code>
      resolves to <code>/about</code>. A child path of <code>/</code> represents the parent's
      index page.
    </p>

    <h2>Use a router instance when you need it</h2>
    <p>
      The direct <code>Router</code> form is enough when the component only needs to render routes.
      Use <code>createRouter()</code> when application code also needs the router instance for
      imperative navigation or to inspect its reactive state.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { onDestroy } from "vynn";
import { createRouter, Router } from "vynn-router";

export function App(props: { url: string }) {
  const router = createRouter({
    routes,
    url: props.url,
  });

  onDestroy(() => router.dispose());

  return <Router router={router} />;
}`}
    />
    <p>
      A router created for an application owns its history subscription. Dispose it when the
      application owner is destroyed. Create a separate router instance for each server request.
    </p>
  </article>
);

export default BasicRoutingPage;
