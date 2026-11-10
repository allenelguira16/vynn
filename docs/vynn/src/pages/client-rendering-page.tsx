import { CodeBlock } from "../components/CodeBlock";

export const ClientRenderingPage = () => (
  <div>
    <h1>Client rendering</h1>
    <section>
      <p>
        The <code>vynn/client</code> entry point exposes the functions that attach a Vynn
        application to DOM nodes. Use <code>renderToDOM()</code>
        for a client-rendered app and <code>hydrateToDOM()</code> when the server has already
        rendered the matching markup.
      </p>

      <h2 class="mt-6">renderToDOM()</h2>
      <p>
        Pass a component function and a target. The target can be a CSS selector, an{" "}
        <code>Element</code>, a <code>Document</code>, or a<code>DocumentFragment</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { renderToDOM } from "vynn/client";

function App() {
  return <h1>Hello from Vynn</h1>;
}

const unmount = renderToDOM(App, "#app");

// Later, dispose the app and remove its rendered nodes.
unmount();
      `}
      />
      <p>
        The function returns an unmount callback. Call it when the application should be disposed.
        Vynn disposes the root owner and removes the nodes that were mounted by that render.
      </p>

      <h2 class="mt-6">Mounting into an existing element</h2>
      <CodeBlock
        lang="tsx"
        code={`
const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app element");
}

const unmount = renderToDOM(App, root);
      `}
      />
      <p>
        Rendering into an element appends the application nodes to that element. Choose a target
        whose existing children should be preserved or replaced by your own application logic;{" "}
        <code>renderToDOM()</code>
        does not automatically clear arbitrary pre-existing content.
      </p>

      <h2 class="mt-6">Hydrating server-rendered markup</h2>
      <p>
        Use <code>hydrateToDOM()</code> when the target already contains HTML produced by the
        matching Vynn application. Hydration connects the client runtime to that existing structure
        instead of creating a second copy of the UI.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { hydrateToDOM } from "vynn/client";

function App() {
  return (
    <main>
      <h1>Welcome back</h1>
      <button onClick={() => console.log("Hydrated")}>
        Continue
      </button>
    </main>
  );
}

// The server-rendered app is already in #app.
const unmount = hydrateToDOM(App, "#app");
      `}
      />

      <p>
        The client component tree and the server output must describe the same application
        structure. Keep request-specific data consistent between the server render and the browser's
        initial hydration. A mismatch in application data or tree shape can cause hydration
        mismatches.
      </p>

      <h2 class="mt-6">Hydrating a full document</h2>
      <p>
        The target can be the <code>Document</code> itself when the application owns the document
        shell. This is useful when the root component returns <code>&lt;html&gt;</code>,{" "}
        <code>&lt;head&gt;</code>, and
        <code>&lt;body&gt;</code>. The document-root form has stricter requirements than mounting
        into an ordinary element: provide one
        <code>&lt;html&gt;</code> root with both a head and body.
      </p>

      <h2 class="mt-6">Disposal and cleanup</h2>
      <p>
        Both mounting functions return a disposer. Disposing the app releases its owner tree, which
        in turn runs registered <code>onDestroy()</code>
        callbacks, effect cleanup functions, and component-owned listeners. Prefer this disposer
        over manually removing individual DOM nodes.
      </p>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>renderToDOM(App, target)</code>
      </h3>
      <p>
        Creates a new client-rendered application in the target and returns an unmount function.
      </p>
      <h3>
        <code>hydrateToDOM(App, target)</code>
      </h3>
      <p>Hydrates existing server-rendered markup and returns an unmount function.</p>
    </section>
  </div>
);
