import { Link, Outlet } from "vynn-router";

import vynnLogo from "./assets/vynn.svg";

export default function Layout() {
  console.log("Layout Rerender");
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
            <li>
              <details open>
                <summary>Get Started</summary>
                <ul>
                  <li>
                    <Link href="/docs/introduction" activeClass="menu-active">
                      Introduction
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs/installation" activeClass="menu-active">
                      Installation
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs/things-to-know" activeClass="menu-active">
                      Things to know
                    </Link>
                  </li>
                </ul>
              </details>
            </li>
            <li>
              <details open>
                <summary>Core concepts</summary>
                <ul>
                  <li>
                    <h2 class="menu-title">Lifecycle</h2>
                    <ul>
                      <li>
                        <Link href="/docs/core-concepts/on-mount" activeClass="menu-active">
                          onMount
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/on-destroy" activeClass="menu-active">
                          onDestroy
                        </Link>
                      </li>
                    </ul>
                  </li>
                  <li>
                    <h2 class="menu-title">Reactivity</h2>
                    <ul>
                      <li>
                        <Link href="/docs/core-concepts/state" activeClass="menu-active">
                          state
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/store" activeClass="menu-active">
                          store
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/computed" activeClass="menu-active">
                          computed
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/effect" activeClass="menu-active">
                          effect
                        </Link>
                      </li>
                    </ul>
                  </li>
                  <li>
                    <h2 class="menu-title">Async</h2>
                    <ul>
                      <li>
                        <Link href="/docs/core-concepts/resource" activeClass="menu-active">
                          resource
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/suspense" activeClass="menu-active">
                          Suspense
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/lazy" activeClass="menu-active">
                          lazy
                        </Link>
                      </li>
                    </ul>
                  </li>
                  <li>
                    <h2 class="menu-title">Utilities</h2>
                    <ul>
                      <li>
                        <Link href="/docs/core-concepts/loop" activeClass="menu-active">
                          loop
                        </Link>
                      </li>
                      <li>
                        <Link href="/docs/core-concepts/memo" activeClass="menu-active">
                          memo
                        </Link>
                      </li>
                    </ul>
                  </li>
                </ul>
              </details>
            </li>
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
        <Outlet />
      </div>
    </div>
  );
}
