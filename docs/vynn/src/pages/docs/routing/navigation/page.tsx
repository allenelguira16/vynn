import { CodeBlock } from "../../../../components/code-block";

const NavigationPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Navigation</h1>
    <p class="lead">
      Use <code>Link</code> for navigation in your UI, or call <code>navigate()</code> and
      <code>replace()</code> from application code.
    </p>

    <h2>Navigate with Link</h2>
    <p>
      <code>Link</code> renders an anchor and performs client-side navigation for same-origin
      application URLs. It keeps normal browser behavior for modified clicks and links that open
      another browsing context.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { Link } from "vynn-router";

export function Navigation() {
  return (
    <nav>
      <Link href="/" activeClass="font-semibold text-primary">
        Home
      </Link>
      <Link href="/about" activeClass="font-semibold text-primary">
        About
      </Link>
    </nav>
  );
}`}
    />

    <h2>Navigate from code</h2>
    <p>
      Call <code>navigate()</code> to add a history entry, or <code>replace()</code> to replace the
      current one. Both accept a path, query string, and optional hash.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { navigate, replace } from "vynn-router";

function Actions() {
  return (
    <>
      <button onClick={() => navigate("/users/42")}>
        Open user
      </button>
      <button onClick={() => replace("/login")}>
        Replace with login
      </button>
    </>
  );
}`}
    />
    <p>
      When you have a router instance, it also exposes <code>router.navigate()</code> and
      <code>router.replace()</code>. Instance methods are useful when an application has more than
      one router.
    </p>

    <h2>Read the current URL</h2>
    <p>
      <code>$location</code> exposes the current pathname and search string. It is reactive, so
      bindings that read these properties update after navigation.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { $location, $search } from "vynn-router";

export default function CurrentLocation() {
  return (
    <p>
      Path: {$location.pathname}
      Query: {$location.search}
      Tab: {$search.tab ?? "overview"}
    </p>
  );
}`}
    />
    <p>
      Use <code>$params</code> for dynamic path segments and <code>$search</code> for individual
      query values. See <a href="/docs/routing/dynamic-routes">Dynamic routes</a>.
    </p>
  </article>
);

export default NavigationPage;
