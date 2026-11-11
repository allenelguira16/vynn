import { CodeBlock } from "../../../../components/code-block";

const RenderingPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Build an app</p>
    <h1>Rendering</h1>
    <p class="lead">
      Vynn supports client rendering and server-side rendering. The Vite plugin connects the
      application entry, browser runtime, and server output so most apps do not need to manage
      mounting and hydration by hand.
    </p>

    <h2>Start with the integrated Vite plugin</h2>
    <p>
      Calling <code>vynn()</code> enables the integrated application by default. It discovers
      <code>src/App.*</code> or <code>src/app.*</code>, generates the browser entry, and serves the
      application in development and production.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { defineConfig } from "vite";\nimport vynn from "vite-plugin-vynn";\n\nexport default defineConfig({\n  plugins: [vynn()],\n});'
      }
    />
    <p>
      You do not need to create a separate HTML shell or call <code>renderToDOM()</code> when the
      integrated app plugin owns the entry point.
    </p>

    <h2>Return the complete document</h2>
    <p>
      The root app component can return the full document, including <code>html</code>,
      <code>head</code>, and <code>body</code>. Import stylesheets explicitly from the root app or
      from a module in its import graph. Vynn does not guess stylesheet paths.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import "./styles.css";\n\nexport function App() {\n  return (\n    <html lang="en">\n      <head>\n        <title>My Vynn app</title>\n        <meta name="description" content="A Vynn application." />\n      </head>\n      <body>\n        <main>\n          <h1>Rendered by Vynn</h1>\n        </main>\n      </body>\n    </html>\n  );\n}'
      }
    />
    <p>
      Native JSX <code>title</code>, <code>meta</code>, and <code>link</code> elements are managed
      in the document head. They can be declared in nested components as well as the root app.
      Reactive attributes and title content update as their owning components update.
    </p>

    <h2>Enable server rendering</h2>
    <p>
      Set <code>ssr: true</code> to render the app on the server and hydrate the existing document
      in the browser. The Vite plugin manages both the server render and the browser hydration
      entry.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { defineConfig } from "vite";\nimport vynn from "vite-plugin-vynn";\n\nexport default defineConfig({\n  plugins: [\n    vynn({\n      ssr: true,\n      ssrMode: "stream",\n    }),\n  ],\n});'
      }
    />
    <p>
      With SSR enabled, the root component receives the request URL as <code>props.url</code>. Use
      this value when rendering depends on the incoming request, or pass it to an application
      integration that needs the URL. The server render should not depend on browser-only globals
      such as <code>window.location</code>.
    </p>

    <h2>Choose an SSR mode</h2>
    <p>
      The mode controls when rendering completes and what type of data appears in the result's
      <code>body</code>. <code>renderToServer()</code> wraps that body together with the head
      manager and loaded-module set.
    </p>
    <div class="not-prose my-6 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Body type</th>
            <th>Behavior</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>stream</code>
            </td>
            <td>
              <code>ReadableStream&lt;Uint8Array&gt;</code>
            </td>
            <td>Streams the document while async boundaries resolve. This is the default.</td>
          </tr>
          <tr>
            <td>
              <code>async</code>
            </td>
            <td>
              <code>string</code>
            </td>
            <td>Waits for async rendering to finish before returning the HTML.</td>
          </tr>
          <tr>
            <td>
              <code>sync</code>
            </td>
            <td>
              <code>string</code>
            </td>
            <td>Renders synchronously. Use only when the render does not need async work.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The integrated plugin defaults to <code>stream</code>. Choose <code>async</code> when your
      server needs the complete HTML string before responding. Choose <code>sync</code> only when
      the app is guaranteed not to suspend on asynchronous resources.
    </p>

    <h2>Place async boundaries intentionally</h2>
    <p>
      Wrap content that may read async resources in <code>Await</code>. During streaming SSR, the
      fallback can be sent first and replaced when the content is ready. On the client, the same
      boundary handles the initial pending state.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { Await } from "vynn";\n\nfunction DashboardPage() {\n  return (\n    <main>\n      <PageHeader />\n      <Await fallback={<DashboardSkeleton />}>\n        <DashboardData />\n      </Await>\n    </main>\n  );\n}'
      }
    />
    <p>
      Keep a boundary around the section that actually needs to wait. A page can render its header
      and navigation while a smaller dashboard panel is still loading. See
      <a href="/docs/core-concepts/async-ui">Async UI</a> for how pending values and fallbacks work.
    </p>

    <h2>What the SSR render returns</h2>
    <p>
      For a custom server integration, <code>renderToServer()</code> returns a result object with
      the rendered <code>body</code>, a request-local <code>head</code> manager, and the set of
      loaded <code>modules</code>. The <code>async</code> mode returns a Promise for that result;
      <code>stream</code> returns the result immediately with a readable stream as its body.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { renderToServer } from "vynn/server";\n\nconst result = await renderToServer(\n  () => App({ url: request.url }),\n  "async",\n  request,\n);\n\nconst html = result.body;\nconst headMarkup = result.head.render();\nconst usedModules = result.modules;'
      }
    />
    <p>
      Pass the incoming Web <code>Request</code> as the third argument when server code needs the
      request context. The returned head manager can render the current head entries and subscribe
      to updates while a streaming render is active.
    </p>

    <h2>Manual client mounting and hydration</h2>
    <p>
      The client package exports <code>renderToDOM()</code> for mounting new DOM and
      <code>hydrateToDOM()</code> for attaching Vynn to existing server-rendered DOM. Both accept a{" "}
      <code>Document</code>, an element, a document fragment, or a selector string. Both return an
      unmount function.
    </p>
    <CodeBlock lang="html" code={'<div id="app"></div>'} />
    <CodeBlock
      lang="tsx"
      code={
        'import { renderToDOM } from "vynn/client";\nimport { App } from "./app";\n\n// Mount into an existing container that does not contain server-rendered app markup.\nconst unmount = renderToDOM(App, "#app");\n\n// When this app is no longer needed:\nunmount();'
      }
    />
    <p>
      Use <code>renderToDOM()</code> when the target is empty or when you want Vynn to create the
      DOM nodes. It appends the rendered nodes to the target and returns a function that disposes
      the component owner and removes those nodes.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { hydrateToDOM } from "vynn/client";\nimport { App } from "./app";\n\nconst unmount = hydrateToDOM(App, document);\n\n// When this application is no longer needed:\nunmount();'
      }
    />
    <p>
      Hydration expects the matching server-rendered markup to already exist. Use
      <code>renderToDOM()</code> when there is no server markup to claim. These lower-level
      functions are for custom integrations; the Vite app plugin normally performs this work for
      you.
    </p>

    <h2>Deploy behind a custom Node server</h2>
    <p>
      An SSR build produces browser assets in <code>dist/client/</code> and a server handler in
      <code>dist/server/</code>. The generated Node entry exports a listener that can be mounted in
      Express or another Node HTTP server.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import compression from "compression";\nimport express from "express";\nimport sirv from "sirv";\n\nimport { listener } from "./dist/server/node.js";\n\nconst app = express();\n\n// Serve assets before sending application requests to Vynn.\napp.use(compression(), sirv("./dist/client", { extensions: [] }));\napp.use(listener);\n\napp.listen(3000);'
      }
    />
    <p>
      Mount the Vynn listener before request-body parsers so server-function POST bodies remain
      available to the handler. The listener adapts Node requests to Web Requests and streams the
      Web Response back to Node. It does not own your server, middleware, or unrelated routes.
    </p>
    <p>
      Vite preview can serve the generated SSR app without a custom server. For a Fetch-based
      runtime, the generated server handler can be called with a Web <code>Request</code> directly.
    </p>

    <h2>Custom entries</h2>
    <p>
      Projects can provide <code>src/entry-client.*</code> and
      <code>src/entry-server.*</code> to customize the generated entries. A custom server entry can
      export an async <code>render(url, mode)</code> function and call
      <code>renderToServer()</code> itself. Use this only when the default integration does not
      match the needs of your host environment. The lower-level SSR result, head manager, preload
      helpers, and reusable Node adapter are documented in
      <a href="/docs/reference/server-integration">Server integration APIs</a>.
    </p>
  </article>
);


export default RenderingPage;
