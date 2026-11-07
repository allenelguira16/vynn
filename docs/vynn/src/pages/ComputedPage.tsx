import { CodeBlock } from "../components/CodeBlock";

export const ComputedPage = () => {
  return (
    <div>
      <h1>computed</h1>
      <section>
        <p>
          <code>computed</code> creates a **derived reactive signal** based on other reactive
          sources like <code>state</code> or <code>store</code>. It automatically tracks
          dependencies and updates only when those dependencies change.
        </p>
        <p>
          It's useful for calculating values that depend on other signals, without needing to
          manually re-calculate them yourself.
        </p>
        <p>
          It behaves similarly to <code>createMemo()</code> in Solid.js or derived stores in Svelte.
          You access its value through <code>.value</code>, just like a <code>state</code>.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            import { createApp, state, computed } from "vynn";

            function Counter() {
              const count = state(0);
              const double = computed(() => count.value * 2); // auto-updates when count changes

              const handleCount = () => {
                count.value++;
              };

              return (
                <div>
                  <div>Count: {count.value}</div>
                  <div>Double Count: {double.value}</div>
                  <button disabled={count.value > 5} onClick={handleCount}>
                    Add counter
                  </button>
                </div>
              );
            }

            createApp(Counter).mount("#app");
          `}
        />
        <p>
          <strong>Tip:</strong> <code>computed</code> is lazy—its function runs only when needed,
          and re-runs only if its dependencies change.
        </p>
        <h2 class="mt-6">
          Using store? You might not need <code>computed</code>
        </h2>
        <p>
          If you're using <code>store</code>, you can define reactive getters directly inside the
          object. These getters will automatically re-compute when their dependencies change, so you
          don't need to use <code>computed()</code>.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            import { store, createRoot } from "vynn

            function Counter() {
              const state = store({
                count: 0,
                get double() {
                  return this.count * 2, // or if you want to separate it you can just pass the state here
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

            createApp(App).mount("#app");
          `}
        />
        <p>
          <strong>Note:</strong> This only works inside <code>store</code>. If you're using
          <code>state</code> or need to reuse derived logic across multiple places, prefer
          <code>computed()</code>.
        </p>
      </section>
    </div>
  );
};
