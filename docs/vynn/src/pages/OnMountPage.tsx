import { CodeBlock } from "../components/CodeBlock";

export const OnMountPage = () => {
  return (
    <div>
      <h1>onMount</h1>
      <section>
        <p>
          <code>onMount()</code> is a lifecycle hook that runs after the component has been created
          and its DOM has been inserted into the document. This is the right place to:
        </p>
        <ul>
          <li>Attach event listeners</li>
          <li>Start animations</li>
          <li>Measure layout or access the DOM</li>
          <li>Trigger async tasks like data loading</li>
        </ul>

        <p class="mt-4">
          You can optionally return a <strong>cleanup function</strong> from the{" "}
          <code>onMount</code> callback. This function will run automatically when the component is
          removed from the DOM.
        </p>

        <p class="mt-4">
          <strong>Bonus:</strong> The function passed to <code>onMount</code> can be{" "}
          <code>async</code> — and so can the returned cleanup.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { createRoot, onMount } from "vynn";

            function App() {
              onMount(() => {
                function handleClick(event: MouseEvent) {
                  console.log("Clicked!", event);
                }

                window.addEventListener("click", handleClick);

                return () => {
                  window.removeEventListener("click", handleClick);
                };
              });

              return (
                <div>
                  <h1>Click anywhere</h1>
                  <span>Once removed, clicks will no longer be logged.</span>
                </div>
              );
            }

            createApp(App).mount("#app");
          `}
        />

        <h2 class="mt-6">Async usage</h2>
        <p>
          You can <code>await</code> inside <code>onMount</code>, and you can also return an async
          cleanup:
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            onMount(async () => {
              const socket = await connectToSocket();

              socket.listen("message", () => {
                console.log("Got message");
              });

              return async () => {
                // Async teardown
                await socket.disconnect();
              };
            });
          `}
        />

        <p class="mt-6">Whether the cleanup is sync or async, Vynn handles it automatically.</p>
      </section>
    </div>
  );
};
