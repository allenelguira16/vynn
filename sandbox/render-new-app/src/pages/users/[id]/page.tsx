import {
  $params,
  $search,
  Link,
  redirect,
  type BeforeLoadContext,
} from "vynn-router/render_new";

export async function beforeLoad({ params }: BeforeLoadContext) {
  if (params.id === "0") {
    redirect("/");
  }
}

export default function UserPage() {
  const nextId = $params.id === "42" ? "84" : "42";

  return (
    <section className="route-page">
      <div className="eyebrow"><span></span> Native file router</div>
      <h1>Dynamic route parameters</h1>
      <p>
        This page is loaded from <code>pages/users/[id]/page.tsx</code>.
        The current route parameter is reactive.
      </p>
      <div className="route-card">
        <span className="metric-index">ROUTE PARAMETER</span>
        <strong className="route-value">User {$params.id}</strong>
        <span className="route-detail">Query tab: {$search.tab ?? "overview"}</span>
      </div>
      <div className="route-actions">
        <Link
          href={"/users/" + nextId + "?tab=activity"}
          class="button button-primary"
        >
          Navigate to user {nextId}
        </Link>
        <Link href="/users/0" class="button button-quiet">
          Trigger beforeLoad redirect
        </Link>
        <Link href="/" class="button button-quiet">
          Back to playground
        </Link>
      </div>
      <p className="route-note">
        The /users/0 route redirects during route preparation, before its route
        component is rendered or hydrated.
      </p>
    </section>
  );
}
