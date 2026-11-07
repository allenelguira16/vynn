import { CodeBlock } from "../components/CodeBlock";

export const SuspensePage = () => {
  return (
    <div>
      <h1>Suspense</h1>
      <section>
        <p>
          <code>&lt;Suspense&gt;</code> lets you display a fallback UI while waiting for an async
          resource (like <code>resource()</code>) to resolve. This is useful for loading states in
          pages, components, or parts of the DOM that fetch data lazily.
        </p>
        <p>
          It works by intercepting thrown <code>Promise</code>s from components or expressions
          during render, and temporarily rendering the <code>fallback</code> until they resolve.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { Suspense, createApp, resource } from "vynn";

            function App() {
              const msg = resource(async () => {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                return "hello world";
              });

              return (
                <div>
                  <div>
                    Msg:
                    <Suspense fallback={<>loading message...</>}>
                      {msg.data}
                    </Suspense>
                  </div>
                </div>
              );
            }

            createApp(App).mount("#app");
          `}
        />

        <h2 class="mt-6">How it works</h2>
        <ul>
          <li>
            When a <code>Promise</code> is thrown during render (like from{" "}
            <code>resource().data</code>), the nearest <code>&lt;Suspense&gt;</code> boundary
            catches it.
          </li>
          <li>
            The <code>fallback</code> is rendered while the promise is pending.
          </li>
          <li>Once the promise resolves, the real children are rendered in-place.</li>
        </ul>

        <h2 class="mt-6">Multiple resources?</h2>
        <p>
          If you use multiple <code>resource()</code> inside one boundary, suspense waits for all of
          them to resolve before showing the real content.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            <Suspense fallback={<p>Loading...</p>}>
              <div>{user.data}</div>
              <div>{posts.data}</div>
            </Suspense>
          `}
        />
      </section>
    </div>
  );
};
