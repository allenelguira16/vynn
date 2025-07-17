import { CodeBlock } from "../components/CodeBlock";

export const OnDestroyPage = () => {
  return (
    <div>
      <h1>onDestroy</h1>
      <section>
        <p>
          <code>onDestroy()</code> lets you run cleanup logic right before the component is removed
          from the DOM. It's useful for:
        </p>
        <ul>
          <li>Clearing timers or intervals</li>
          <li>Disconnecting sockets or observers</li>
          <li>Canceling subscriptions or requests</li>
        </ul>

        <p class="mt-4">
          If your teardown is directly related to logic inside <code>onMount()</code>, it's often
          better to return a cleanup function from <code>onMount()</code> instead. But
          <code>onDestroy()</code> gives you more flexibility when the setup isn't colocated.
        </p>

        <p class="mt-4">
          <strong>Bonus:</strong> <code>onDestroy()</code> fully supports <code>async</code>{" "}
          functions. You can perform asynchronous teardown logic if needed.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { createApp, onDestroy } from "vynn";

            function App() {
              onDestroy(() => {
                console.log("Help, I am going to be k---");
              });

              return <div>Hello, World~</div>;
            }

            const app = createApp(App);
            app.mount("#app");

            setTimeout(() => {
              app.unmount(); // Triggers onDestroy after 5 seconds
            }, 5000);
          `}
        />

        <h2 class="mt-6">Async example</h2>
        <CodeBlock
          lang="tsx"
          code={`
            onDestroy(async () => {
              console.log("Disconnecting...");
              await new Promise((resolve) => setTimeout(resolve, 1000));
              console.log("Disconnected");
            });
          `}
        />

        <p class="mt-4">
          Whether the function is sync or async, Vynn will handle it properly when the component is
          torn down.
        </p>
      </section>
    </div>
  );
};
