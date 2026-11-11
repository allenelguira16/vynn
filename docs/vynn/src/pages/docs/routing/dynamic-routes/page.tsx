import { CodeBlock } from "../../../../components/code-block";

const DynamicRoutesPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Dynamic routes</h1>
    <p class="lead">
      Use a dynamic segment when part of the URL identifies a record or resource. Read matched
      segments through Vynn Router's reactive <code>$params</code> object.
    </p>

    <h2>Dynamic folder segments</h2>
    <p>
      In file-based routing, wrap a folder name in square brackets. The folder name becomes the
      parameter name.
    </p>
    <CodeBlock
      lang="bash"
      code={`src/app/
└── users/
    └── [id]/
        └── page.tsx`}
    />
    <p>
      This defines a route such as <code>/users/42</code>. Read the parameter in the page:
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { $params } from "vynn-router";

export default function UserPage() {
  return <h1>User {$params.id}</h1>;
}`}
    />

    <h2>Route parameters in route objects</h2>
    <p>
      With manually defined routes, use <code>:name</code> for a dynamic segment. The parameter
      name is the part after the colon.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { $params, type Route } from "vynn-router";

const routes: Route[] = [
  {
    path: "/users/:id",
    component: () => <h1>User {$params.id}</h1>,
  },
];`}
    />

    <h2>Catch-all segments</h2>
    <p>
      A required catch-all captures one or more remaining path segments. An optional catch-all
      also matches when no segments remain.
    </p>
    <CodeBlock
      lang="bash"
      code={`src/app/
├── docs/
│   └── [...slug]/
│       └── page.tsx
└── files/
    └── [[...path]]/
        └── page.tsx`}
    />
    <p>
      For a catch-all route, the captured path is available as <code>$params["*"]</code>. In a
      route object, use <code>*</code> for a required catch-all and <code>*?</code> for an optional
      catch-all.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { $params } from "vynn-router";

export default function DocsPage() {
  return <p>Requested document: {$params["*"]}</p>;
}`}
    />

    <h2>Query parameters</h2>
    <p>
      Query parameters are separate from path parameters. Read them through the reactive
      <code>$search</code> object.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import { $search } from "vynn-router";

export default function SearchPage() {
  return <p>Search query: {$search.q ?? "Nothing entered"}</p>;
}`}
    />
  </article>
);

export default DynamicRoutesPage;
