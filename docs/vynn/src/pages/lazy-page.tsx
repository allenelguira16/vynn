import { CodeBlock } from "../components/CodeBlock";

export const LazyPage = () => (
  <div>
    <h1>lazy</h1>
    <section>
      <p>
        <code>lazy()</code> lets you load components dynamically instead of including them in the
        initial application bundle. This is useful for code-splitting, large pages, and components
        that are not needed immediately.
      </p>
      <p>
        It accepts a dynamic import function and returns a component that loads the requested module
        when it is rendered. While the module is loading, the component suspends so that{" "}
        <code>&lt;Await&gt;</code>
        can display a fallback.
      </p>

      <h2 class="mt-6">Basic usage</h2>
      <p>
        By default, <code>lazy()</code> expects the dynamically imported module to have a default
        component export.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { lazy, Await } from "vynn";

const LazyHello = lazy(() => import("./Hello"));

function App() {
  return (
    <Await fallback={<p>Loading component...</p>}>
      <LazyHello />
    </Await>
  );
}
      `}
      />
      <p>
        When <code>LazyHello</code> is rendered, Vynn starts loading the module. Until the component
        is available, <code>&lt;Await&gt;</code>
        displays its fallback. Once the module finishes loading, Vynn renders the actual component.
      </p>

      <h2 class="mt-6">Named exports</h2>
      <p>You can load a named component export by passing its name as the second argument.</p>
      <CodeBlock
        lang="tsx"
        code={`
import { lazy } from "vynn";

// Loads the named "Hello" export from ./Hello.
const LazyHello = lazy(() => import("./Hello"), "Hello");
      `}
      />
      <p>
        The selected export must be a component. If the requested export does not exist or is not a
        function component, Vynn throws an error.
      </p>

      <h2 class="mt-6">Passing props</h2>
      <p>
        Lazy components work like regular components. Props passed to the lazy component are
        forwarded to the selected component after the module loads.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { lazy, Await } from "vynn";

const LazyProfile = lazy(() => import("./Profile"));

function App() {
  return (
    <Await fallback={<p>Loading profile...</p>}>
      <LazyProfile name="Ada" />
    </Await>
  );
}
      `}
      />

      <h2 class="mt-6">SSR module IDs</h2>
      <p>
        The optional third argument identifies the module to the server renderer. Vynn adds that ID
        to the render result's
        <code>modules</code> set, which a custom SSR integration can use with its client manifest to
        generate the required preload links.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { lazy } from "vynn";

const LazyReports = lazy(
  () => import("./Reports"),
  undefined,
  "/src/pages/Reports.tsx",
);
      `}
      />
      <p>
        Supply the module identifier expected by your server manifest. The second argument remains
        the named export, so pass
        <code>undefined</code> when using the default export and specifying the third argument.
      </p>

      <h2 class="mt-6">How it works</h2>
      <ul>
        <li>The lazy component starts loading its module when it is rendered.</li>
        <li>
          While the module is pending, its async value suspends and registers the loading Promise
          with the nearest <code>&lt;Await&gt;</code>.
        </li>
        <li>
          <code>&lt;Await&gt;</code> displays its fallback while the initial content is pending.
        </li>
        <li>Once the module resolves, Vynn renders the selected component.</li>
        <li>
          The module-loading Promise is shared by instances created from the same lazy declaration;
          each instance has its own reactive component value.
        </li>
      </ul>

      <h2 class="mt-6">Handling loading errors</h2>
      <p>
        If the dynamic import fails or the requested export is invalid, the lazy component throws an
        error. Use <code>&lt;ErrorBoundary&gt;</code>
        to provide a fallback for these failures.
      </p>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>lazy(loader, namedExport?, moduleId?)</code>
      </h3>
      <ul>
        <li>
          <code>loader</code>: a function that dynamically imports a module.
        </li>
        <li>
          <code>namedExport</code>: the component export to select. Omit it or pass{" "}
          <code>undefined</code> to use <code>default</code>.
        </li>
        <li>
          <code>moduleId</code>: an optional server module identifier added to the SSR render's
          module set.
        </li>
      </ul>
    </section>
  </div>
);
