import { CodeBlock } from "../components/CodeBlock";

export const InstallationPage = () => (
  <div>
    <h1>Installation</h1>
    <section>
      <p>
        Install the <code>vynn</code> package in your application. Use a version available from your
        package registry, or depend on the workspace package when developing inside the Vynn
        monorepo.
      </p>

      <h2 class="mt-6">Install the package</h2>
      <CodeBlock
        lang="bash"
        code={`
pnpm add vynn

# or
npm install vynn

# or
yarn add vynn
      `}
      />
      <p>
        In a monorepo that already contains the Vynn workspace package, use the workspace protocol
        configured by that repository rather than downloading a registry release.
      </p>

      <h2 class="mt-6">Import core APIs</h2>
      <p>
        Reactive primitives and components are imported from the package root. Client and server
        renderers use dedicated subpaths.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $effect, $state, $store, Await } from "vynn";
import { renderToDOM } from "vynn/client";
      `}
      />

      <h2 class="mt-6">Choose the runtime entry point</h2>
      <ul>
        <li>
          <code>vynn</code> for reactive state, components, context, lifecycle APIs, and public core
          types.
        </li>
        <li>
          <code>vynn/client</code> for mounting and hydration in a browser.
        </li>
        <li>
          <code>vynn/server</code> for server rendering, server-function handling, request context,
          and SSR helpers.
        </li>
        <li>
          <code>vynn/server/node</code> for Node HTTP adapters.
        </li>
        <li>
          <code>vynn/server-functions/client</code> for the browser-side server-function RPC
          runtime.
        </li>
        <li>
          <code>vynn/server-functions/server</code> for the server-side server-function runtime. The
          same server APIs are also re-exported from <code>vynn/server</code>.
        </li>
        <li>
          <code>vynn/jsx-runtime</code> for the JSX type export used by JSX tooling.
        </li>
        <li>
          <code>vynn/render</code> for low-level DOM/SSR rendering helpers used by generated runtime
          integrations. Normal application components should use the root and client/server entry
          points instead.
        </li>
      </ul>
      <p>
        Keep server-only entry points out of browser bundles. In particular,
        <code>vynn/server</code>, <code>vynn/server-functions/server</code>, and{" "}
        <code>vynn/server/node</code> contain server-side runtime code; the Node adapter also
        depends on Node's HTTP and stream APIs.
      </p>

      <h2 class="mt-6">Render a client application</h2>
      <p>
        Once your project has a compatible JSX transform configured, a minimal client-rendered
        application can be mounted into an element in the document.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state } from "vynn";
import { renderToDOM } from "vynn/client";

function App() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}

renderToDOM(App, "#app");
      `}
      />

      <h2 class="mt-6">JSX and TypeScript setup</h2>
      <p>
        Vynn core provides the JSX types and runtime-facing package entry points, but TSX source
        still needs a compatible JSX transform and TypeScript configuration. The separate compiler
        documentation covers that configuration and the supported build integrations. This guide
        intentionally focuses on runtime usage rather than repeating compiler setup.
      </p>

      <h2 class="mt-6">Next steps</h2>
      <p>
        Start with <code>$state()</code> and <code>$store()</code>, then learn computed values,
        effects, async resources, and component lifecycle. For applications that render on the
        server, continue to the client rendering and server rendering guides.
      </p>
    </section>
  </div>
);
