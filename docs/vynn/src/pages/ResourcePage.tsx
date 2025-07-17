import { CodeBlock } from "../components/CodeBlock";

export const ResourcePage = () => {
  return (
    <div>
      <h1>resource</h1>
      <section>
        <p>
          <code>resource</code> is a reactive async utility that helps you fetch and track
          asynchronous data in a declarative way. It automatically updates the DOM and effects when
          the data resolves or errors.
        </p>
        <p>
          It integrates with suspense boundaries (if supported) and throws promises to coordinate
          async rendering.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            import { createApp, resource } from "vynn";

            function App() {
              const msg = resource(async () => {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                return "hello world";
              });

              return (
                <div>
                  <div>Msg: {msg.data}</div>
                </div>
              );
            }

            createApp(App).mount("#app");
          `}
        />

        <h2 class="mt-6">Features</h2>
        <ul>
          <li>📦 Caches result per fetch</li>
          <li>♻️ Fully reactive — DOM updates when resolved</li>
          <li>⏳ Supports suspense (throws promise on pending)</li>
          <li>
            🔁 Manual refetch with <code>.refetch()</code>
          </li>
          <li>
            🧪 Manual mutation with <code>.mutate(newValue)</code>
          </li>
        </ul>

        <h2 class="mt-6">API</h2>
        <ul>
          <li>
            <code>data</code> — the resolved value, or throws a promise/error if still loading or
            failed
          </li>
          <li>
            <code>loading</code> — <code>true</code> while waiting for the promise
          </li>
          <li>
            <code>error</code> — contains any error that occurred during fetch
          </li>
          <li>
            <code>refetch()</code> — triggers the fetcher again manually
          </li>
          <li>
            <code>mutate(value: T)</code> — overrides the current data without running the fetcher
          </li>
        </ul>

        <h2 class="mt-6">Mutate Example</h2>
        <p>You can directly override the result without triggering a re-fetch:</p>
        <CodeBlock lang="tsx" code={`msg.mutate("manual override");`} />

        <h2 class="mt-6">Using with reactive sources</h2>
        <p>
          While your current version doesn't accept reactive dependencies yet, you can wrap the
          fetcher with reactivity:
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            const count = state(0);
            const doubled = resource(() => Promise.resolve(count.value * 2));
          `}
        />
        <p>
          The fetcher will re-run whenever <code>count.value</code> changes due to dependency
          tracking inside <code>effect</code>.
        </p>
      </section>
    </div>
  );
};
