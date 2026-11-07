import { CodeBlock } from "../components/CodeBlock";

export const StatePage = () => {
  return (
    <div>
      <h1>state</h1>
      <section>
        <p>
          <code>state()</code> is a primitive reactive signal in Vynn. It holds a mutable value and
          automatically tracks reads and writes to re-run the DOM or any <code>effect()</code> that
          depends on it.
        </p>

        <p>
          It behaves similarly to React's <code>useState()</code> or Solid's{" "}
          <code>createSignal()</code>, but uses a simple <code>.value</code> getter/setter API:
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { createApp, state } from "vynn";

            function Counter() {
              const count = state(0);

              const handleCount = () => {
                count.value++;
              };

              return (
                <div>
                  <div>Count: {count.value}</div>
                  <button disabled={count.value > 5} onClick={handleCount}>
                    Add counter
                  </button>
                  <div>{count.value <= 3 ? <div>Hi</div> : "string"}</div>
                </div>
              );
            }

            createApp(Counter).mount("#app");
          `}
        />

        <h2 class="mt-6">🔁 Reactivity Behavior</h2>
        <ul>
          <li>
            When you read <code>state.value</code> inside JSX or <code>effect()</code>, Vynn tracks
            the access.
          </li>
          <li>
            When <code>state.value</code> changes, any subscribed code will automatically re-run or
            update.
          </li>
        </ul>

        <h2 class="mt-6">🌍 Global Usage</h2>
        <p>
          <strong>Bonus:</strong> <code>state</code> can also be created outside of components. This
          makes it suitable for shared or app-wide state:
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            // globalState.ts
            export const theme = state("light");

            // App.typescript
            import { theme } from "./globalState";

            function Header() {
              return <div>Theme: {theme.value}</div>;
            }
          `}
        />

        <p class="mt-4">
          Whether you're inside a component or not, <code>state()</code> just works.
        </p>
      </section>
    </div>
  );
};
