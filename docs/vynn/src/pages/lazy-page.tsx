import { CodeBlock } from "../components/CodeBlock";

export const LazyPage = () => (
  <div>
    <h1>lazy</h1>
    <p class="text-base-content/70">Split a feature into its own file and load it only when someone needs it.</p>
    <section>
      <p>
        <code>lazy()</code> lets you split a component into a separate module and load it only when
        the component is needed. This is especially useful for large pages, admin screens, or
        heavier features that most users won't open right away.
      </p>
      <p>
        Pass it a dynamic import function and use the returned value like any other component. The
        module starts loading when that component is rendered. While it loads, the lazy component
        suspends, giving <code>&lt;Await&gt;</code> a chance to show a fallback.
      </p>

      <h2 class="mt-6">Load a component only when it appears</h2>
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
        The first time <code>LazyHello</code> appears, Vynn begins the import. The fallback covers the
        loading period; once the module resolves, Vynn renders the selected component. Later
        instances can reuse the already-loaded module.
      </p>

      <h2 class="mt-6">What if the component isn't the default export?</h2>
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

      <h2 class="mt-6">Pass props just like any other component</h2>
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

      <h2 class="mt-6">Help the server preload the right files</h2>
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

      <h2 class="mt-6">What happens behind the scenes</h2>
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

      <h2 class="mt-6">And if the import fails?</h2>
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
