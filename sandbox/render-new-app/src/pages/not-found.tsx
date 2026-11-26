import { Link } from "vynn-router/render_new";

export default function NotFoundPage() {
  return (
    <section className="route-page">
      <div className="eyebrow"><span></span> 404 / ROUTE NOT FOUND</div>
      <h1>That route does not exist.</h1>
      <p>The file router could not match this URL to a page module.</p>
      <Link href="/" class="button button-primary">
        Return to the playground
      </Link>
    </section>
  );
}
