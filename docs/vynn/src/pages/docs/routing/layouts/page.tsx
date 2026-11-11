import { CodeBlock } from "../../../../components/code-block";

const LayoutsPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Routing</p>
    <h1>Layouts</h1>
    <p class="lead">
      Layouts keep shared UI in one place. A layout renders its child route through
      <code>props.children</code>, so navigation between pages in that section reuses the same
      structure.
    </p>

    <h2>Root layout</h2>
    <p>
      A root <code>layout.tsx</code> wraps every page in the app directory. Use it for application
      chrome such as a header, navigation, and footer.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import type { PropsWithChildren } from "vynn";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <div class="min-h-screen">
      <header>My application</header>
      <main>{children}</main>
      <footer>Made with Vynn</footer>
    </div>
  );
}`}
    />

    <h2>Nested layout</h2>
    <p>
      Add another <code>layout.tsx</code> inside a folder to wrap only that folder and its
      descendants.
    </p>
    <CodeBlock
      lang="bash"
      code={`src/app/
├── layout.tsx
├── page.tsx
└── dashboard/
    ├── layout.tsx
    ├── page.tsx
    └── settings/
        └── page.tsx`}
    />
    <p>
      The dashboard layout wraps both <code>/dashboard</code> and
      <code>/dashboard/settings</code>. It does not affect the home page.
    </p>

    <h2>Render the child route</h2>
    <p>
      A layout must include <code>children</code>. If it leaves children out, the matched page
      cannot appear.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import type { PropsWithChildren } from "vynn";

export default function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <section>
      <h1>Dashboard</h1>
      <nav>{/* Dashboard navigation */}</nav>
      {children}
    </section>
  );
}`}
    />

    <h2>Route groups</h2>
    <p>
      Put a folder name in parentheses, such as <code>(marketing)</code>, to group related pages
      without adding that folder name to the URL. A layout inside the group wraps those pages.
    </p>
    <CodeBlock
      lang="bash"
      code={`src/app/
├── (marketing)/
│   ├── layout.tsx
│   ├── about/
│   │   └── page.tsx
│   └── pricing/
│       └── page.tsx
└── (account)/
    ├── layout.tsx
    └── settings/
        └── page.tsx`}
    />
    <p>
      The marketing pages resolve to <code>/about</code> and <code>/pricing</code>, not
      <code>/(marketing)/about</code> or <code>/(marketing)/pricing</code>.
    </p>
  </article>
);

export default LayoutsPage;
