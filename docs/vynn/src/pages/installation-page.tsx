import { CodeBlock } from "../components/CodeBlock";

export const InstallationPage = () => (
  <div>
    <h1>Installation</h1>
    <section>
      <p>
        There are two ways to get started. For a typical Vite app, use the Vynn Vite plugin: it
        connects the compiler and application runtime for you. If you're embedding Vynn into an
        existing page or building a custom integration, install the core package and use its
        rendering APIs directly.
      </p>

      <h2 class="mt-6">Recommended: start with Vite</h2>
      <p>
        Already using Vite, or starting a new Vite project? Install the runtime and Vite plugin:
      </p>
      <CodeBlock
        lang="bash"
        code={`
pnpm add vynn
pnpm add -D vite vite-plugin-vynn

# npm
npm install vynn
npm install -D vite vite-plugin-vynn
        `}
      />
      <p>
        Add the plugin to <code>vite.config.ts</code>. The plugin includes the Vynn compiler
        integration, so you don't need to wire up a separate JSX transform by hand.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn()],
});
        `}
      />
      <p>
        Then create <code>src/App.tsx</code>. A Vynn app entry owns the document, so return the
        <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> elements
        from your root component.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state } from "vynn";

export default function App() {
  const count = $state(0);

  return (
    <html lang="en">
      <head>
        <title>My Vynn app</title>
      </head>
      <body>
        <main>
          <h1>Hello from Vynn</h1>
          <button onClick={() => count.value++}>
            Clicked {count.value} times
          </button>
        </main>
      </body>
    </html>
  );
}
        `}
      />
      <p>
        Run Vite as you normally would. The plugin discovers <code>src/App.*</code> (or
        <code>src/app.*</code>) and handles the application entry. You can add server rendering
        later with <code>{"vynn({ ssr: true })"}</code>; hydration is handled by the plugin.
        Server functions can be enabled with <code>serverFunctions: true</code>.
      </p>

      <h2 class="mt-6">Building a custom integration without Vite?</h2>
      <p>
        Prefer to mount Vynn into an existing page, or are you writing a custom integration? In
        that case, install just the <code>vynn</code> runtime:
      </p>

      <h3 class="mt-4">Install the core runtime</h3>
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

      <h2 class="mt-6">Mount a client application manually</h2>
      <p>
        For this route, your own build setup must provide a compatible JSX transform. Once TSX is
        compiled, you can mount a component into an existing DOM element with
        <code>renderToDOM()</code>.
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
        The Vite plugin configures Vynn's compiler integration for you. When you're using a different
        build tool, make sure it is configured to compile Vynn's JSX runtime and use the JSX types
        exported by <code>vynn</code>. The
        <a href="https://github.com/allenelguira16/vynn/blob/master/packages/vynn-compiler/README.md">
          compiler package guide
        </a>
        covers the transform itself.
      </p>

      <h2 class="mt-6">Next steps</h2>
      <p>
        For your first feature, try a small counter with <code>$state()</code>. Next, learn when an
        object deserves <code>$store()</code>, how <code>$computed()</code> derives values, and when
        <code>$effect()</code> is useful. Building an SSR app? The client and server rendering guides
        explain how those pieces fit together.
      </p>
    </section>
  </div>
);
