import type { PropsWithChildren } from "vynn";

import { isActiveRoute, Link } from "vynn-router";

import vynnLogo from "./assets/vynn.svg";

const sections = [
  {
    title: "Get started",
    items: [
      { label: "Introduction", href: "/docs/getting-started/introduction" },
      { label: "Installation", href: "/docs/getting-started/installation" },
      { label: "Quick start", href: "/docs/getting-started/quick-start" },
    ],
  },
  {
    title: "Core concepts",
    items: [
      { label: "Reactivity", href: "/docs/core-concepts/reactivity" },
      { label: "Advanced reactivity", href: "/docs/core-concepts/advanced-reactivity" },
      { label: "Components", href: "/docs/core-concepts/components" },
      { label: "Context and lifecycle", href: "/docs/core-concepts/context-and-lifecycle" },
      { label: "Async UI", href: "/docs/core-concepts/async-ui" },
    ],
  },
  {
    title: "Build an app",
    items: [
      { label: "Rendering", href: "/docs/guides/rendering" },
      { label: "Server functions", href: "/docs/guides/server-functions" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "API overview", href: "/docs/reference/api" },
      { label: "Advanced core APIs", href: "/docs/reference/core-runtime" },
      { label: "Server integration", href: "/docs/reference/server-integration" },
      { label: "Server functions API", href: "/docs/reference/server-functions" },
      { label: "Compiler and tooling", href: "/docs/reference/compiler" },
    ],
  },
];

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div class="drawer min-h-screen bg-base-100 lg:drawer-open">
      <input id="docs-drawer" type="checkbox" class="drawer-toggle" />

      <div class="drawer-content flex min-w-0 flex-col">
        <header class="navbar sticky top-0 z-30 min-h-16 border-b border-base-300 bg-base-100/95 px-4 backdrop-blur sm:px-6">
          <div class="flex-none lg:hidden">
            <label
              for="docs-drawer"
              class="btn btn-square btn-ghost drawer-button"
              aria-label="Open documentation menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                class="h-5 w-5 stroke-current"
              >
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </label>
          </div>

          <Link href="/" class="flex items-center gap-2 text-lg font-semibold">
            <img src={vynnLogo} class="h-6 w-6" alt="Vynn logo" />
            <span>Vynn</span>
            <span class="text-sm font-normal text-base-content/55">Docs</span>
          </Link>

          <div class="ml-auto">
            <a
              href="https://github.com/allenelguira16/vynn"
              target="_blank"
              rel="noreferrer"
              class="btn btn-ghost btn-sm"
            >
              GitHub
            </a>
          </div>
        </header>

        <main class="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:px-8 lg:px-12">
          <div class="mb-8 text-sm text-base-content/55">
            Documentation <span class="mx-2">/</span> Learn Vynn
          </div>
          <div class="docs-content prose max-w-none">{children}</div>
          <footer class="mt-16 border-t border-base-300 pt-6 text-sm text-base-content/55">
            Vynn documentation
          </footer>
        </main>
      </div>

      <div class="drawer-side z-40">
        <label for="docs-drawer" aria-label="Close documentation menu" class="drawer-overlay" />
        <aside class="min-h-full w-72 border-r border-base-300 bg-base-100 px-4 py-5">
          <Link href="/" class="mb-8 flex items-center gap-3 px-3">
            <img src={vynnLogo} class="h-8 w-8" alt="Vynn logo" />
            <span class="text-xl font-semibold">Vynn</span>
          </Link>

          <nav aria-label="Documentation">
            {sections.map(({ title, items }) => (
              <section class="mb-6">
                <h2 class="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-base-content/50">
                  {title}
                </h2>
                <ul class="menu menu-sm gap-1 p-0">
                  {items.map(({ label, href }) => (
                    <li>
                      {isActiveRoute(href) && <title>{label} | Vynn</title>}
                      <Link href={href} activeClass="menu-active font-medium">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
