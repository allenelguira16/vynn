import { CodeBlock } from "../components/CodeBlock";

export const StorePage = () => {
  return (
    <div>
      <h1>store</h1>
      <section>
        <p>
          <code>store</code> is a reactive signal in Vynn for working with objects and arrays.
          Unlike <code>state()</code> which is designed for primitive values, <code>store()</code>{" "}
          lets you work with structured data while maintaining full reactivity on every property.
        </p>

        <p>
          You can read and write to any property directly, and any JSX or <code>effect()</code>{" "}
          using those properties will automatically re-run when they change.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { store, createApp } from "vynn";

            function Counter() {
              const state = store({ count: 0 });

              const handleCount = () => {
                state.count++;
              };

              return (
                <div>
                  <div>Count: {state.count}</div>
                  <button disabled={state.count > 5} onClick={handleCount}>
                    Add counter
                  </button>
                  <div>{state.count <= 3 ? <div>Hi</div> : "string"}</div>
                </div>
              );
            }

            createApp(Counter).mount("#app");
          `}
        />

        <h2 class="mt-6">📦 Nested Reactivity</h2>
        <p>
          All nested properties are automatically reactive — you don't need to wrap inner values
          with <code>state()</code>. Just read or update them directly.
        </p>

        <h2 class="mt-6">🧠 Derived Values</h2>
        <p>
          You can define computed-like properties using JavaScript <code>getters</code>. These will
          behave reactively without needing <code>computed()</code>:
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { store, createApp } from "vynn

            function Counter() {
              const state = store({
                count: 0,
                get double() {
                  return this.count * 2;
                },
              });

              const handleCount = () => {
                state.count++;
              };

              return (
                <div>
                  <div>Count: {state.count}</div>
                  <div>Double Count: {state.double}</div>
                  <button disabled={state.count > 5} onClick={handleCount}>
                    Add counter
                  </button>
                </div>
              );
            }

            createApp(Counter).mount("#app");
          `}
        />

        <p class="mt-4">
          Since getters are automatically tracked, you don't need to use <code>computed()</code>{" "}
          with <code>store()</code>.
        </p>
      </section>
    </div>
  );
};
