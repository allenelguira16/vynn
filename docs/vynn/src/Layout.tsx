import { PropsWithChildren } from "vynn";
import { isActiveRoute, Link } from "vynn-router";

import vynnLogo from "./assets/vynn.svg";

// const getStartedLinks = ;

const links = [
  {
    title: "Getting Started",
    items: [
      { label: "Introduction", href: "/docs/getting-started/introduction" },
      { label: "Installation", href: "/docs/getting-started/installation" },
      { label: "Things to know", href: "/docs/getting-started/things-to-know" },
    ],
  },
  {
    title: "Life Cycles",
    items: [
      { label: "onMount", href: "/docs/life-cycles/on-mount" },
      { label: "onDestroy", href: "/docs/life-cycles/on-destroy" },
    ],
  },
  {
    title: "Reactivity",
    items: [
      { label: "$state", href: "/docs/reactivity/state" },
      { label: "$store", href: "/docs/reactivity/store" },
      { label: "$computed", href: "/docs/reactivity/computed" },
      { label: "$effect", href: "/docs/reactivity/effect" },
    ],
  },
  {
    title: "Components",
    items: [
      { label: "Await", href: "/docs/components/await" },
      { label: "ErrorBoundary", href: "/docs/components/error-boundary" },
    ],
  },
  {
    title: "Utilities",
    items: [
      { label: "lazy", href: "/docs/utilities/lazy" },
      { label: "isPending", href: "/docs/utilities/is-pending" },
      { label: "context", href: "/docs/utilities/context" },
    ],
  },
];

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div class="drawer max-w-screen-2xl mx-auto lg:drawer-open">
      <input id="home-drawer" type="checkbox" class="drawer-toggle" />
      <div class="drawer-side">
        <label for="home-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
        <aside class="bg-base-100 min-h-screen w-80">
          <Link href="/" class="flex items-center gap-2 p-4 text-3xl">
            <img src={vynnLogo} class="w-5" alt="Vynn logo" />
            <span>Vynn</span>
          </Link>

          <ul class="menu text-base-content min-h-full w-80 p-4">
            {links.map(({ items, title }) => (
              <li>
                <details open>
                  <summary>{title}</summary>
                  <ul>
                    {items.map(({ label, href }) => (
                      <li>
                        {isActiveRoute(href) && (
                          <title>
                            Vynn {">"} {title} {">"} {label}
                          </title>
                        )}
                        <Link href={href} activeClass="menu-active">
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div class="drawer-content prose max-w-full">
        <div class="navbar bg-base-100 shadow-sm lg:invisible">
          <label class="btn btn-square btn-ghost drawer-button" for="home-drawer">
            <svg
              width="20"
              height="20"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block h-5 w-5 stroke-current md:h-6 md:w-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              ></path>
            </svg>
          </label>

          <Link href="/" class="flex items-center gap-2 p-4 text-xl not-prose">
            <img src={vynnLogo} class="w-4" alt="Vynn logo" />
            <span>Vynn</span>
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
