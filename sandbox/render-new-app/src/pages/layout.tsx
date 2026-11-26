import type { PropsWithChildren } from "vynn";
import { Link } from "vynn-router/render_new";

export default function AppLayout(props: PropsWithChildren) {
  return (
    <>
      <header className="topbar page-shell">
        <Link href="/" class="brand">
          <span className="brand-mark">v</span>
          <span>
            vynn <span className="brand-muted">/ render_new</span>
          </span>
        </Link>
        <nav className="route-navigation" aria-label="Main navigation">
          <Link href="/" class="route-link" activeClass="route-link-active">
            Playground
          </Link>
          <Link href="/users/42?tab=overview" class="route-link" activeClass="route-link-active">
            Route params
          </Link>
          <Link href="/async" class="route-link" activeClass="route-link-active">
            Async resources
          </Link>
        </nav>
        <div className="topbar-meta">
          <span className="status-dot"></span>
          EXPERIMENTAL RENDERER
        </div>
      </header>
      <main className="page-shell">{props.children}</main>
    </>
  );
}
