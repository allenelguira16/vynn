import { $computed, $state } from "vynn";
import { Await } from "vynn/render_new";

export default function AsyncResourcesPage() {
  const request = $state(1);
  const result = $computed(async () => {
    const currentRequest = request.value;
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    return "Resolved response for request #" + currentRequest;
  });

  return (
    <section className="route-page">
      <div className="eyebrow"><span></span> Native async boundary</div>
      <h1>Async resources</h1>
      <p>
        An async computed value is passed to the renderer-native Await boundary.
        The server waits for it before serialization. The browser shows the
        fallback while a new request is pending.
      </p>

      <div className="route-actions">
        <button className="button button-primary" onClick={() => request.value += 1}>
          Start another request
        </button>
      </div>

      <Await
        when={result}
        fallback={
          <div className="async-resource-card async-resource-pending">
            <span className="metric-index">RESOURCE STATUS</span>
            <strong>Waiting for the async result…</strong>
            <span className="route-detail">The fallback is reactive, not a server-only placeholder.</span>
          </div>
        }
      >
        <div className="async-resource-card">
          <span className="metric-index">RESOURCE RESOLVED</span>
          <strong>{result.value}</strong>
          <span className="route-detail">The resolved value is serialized for browser hydration.</span>
        </div>
      </Await>
    </section>
  );
}
