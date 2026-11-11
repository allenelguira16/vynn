import { CodeBlock } from "../components/CodeBlock";

export const ClientRenderingPage = () => (
  <div>
    <h1>Client rendering</h1>
    <section>
      <p>
        The <code>vynn/client</code> entry point is where a browser app meets the DOM. Use
        <code>renderToDOM()</code> when Vynn should create the UI from scratch, or
        <code>hydrateToDOM()</code> when the server has already sent the matching Vynn markup.
      </p>

      <h2 class="mt-6">Starting with an empty page: renderToDOM()</h2>
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
        Keep the returned disposer when you mount the app. Calling it later tears down the root owner,
        runs registered cleanup, and removes the nodes created by that render.
      </p>

      <h2 class="mt-6">Choose where the app should appear</h2>
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
        One detail worth knowing: mounting into an element appends the app's nodes. It doesn't
        silently clear whatever was already there, so choose an empty target or manage existing
        content yourself before mounting.
      </p>

      <h2 class="mt-6">Already have HTML from the server? Hydrate it</h2>
      <p>
        Use <code>hydrateToDOM()</code> when the browser already has HTML from the same Vynn app.
        Hydration attaches event handlers and reactive behavior to that markup instead of building
        a second copy beside it.
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
        The server output and the browser's first render need to agree. Pass the same initial data and
        render the same component structure on both sides. When they disagree, hydration can report
        a mismatch or attach behavior to the wrong nodes.
      </p>

      <h2 class="mt-6">Hydrating the whole document</h2>
      <p>
        The target can be the <code>Document</code> itself when the application owns the document
        shell. This is useful when the root component returns <code>&lt;html&gt;</code>,{" "}
        <code>&lt;head&gt;</code>, and
        <code>&lt;body&gt;</code>. The document-root form has stricter requirements than mounting
        into an ordinary element: provide one
        <code>&lt;html&gt;</code> root with both a head and body.
      </p>

      <h2 class="mt-6">Unmount cleanly when you're done</h2>
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
