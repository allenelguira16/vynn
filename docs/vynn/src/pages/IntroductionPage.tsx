import { CodeBlock } from "../components/CodeBlock";

export const IntroductionPage = () => {
  return (
    <div>
      <h1>Introduction</h1>
      <section>
        <p>
          <strong>Vynn</strong> is a modern UI library designed to give you the{" "}
          <strong>developer ergonomics of React</strong> and the{" "}
          <strong>performance of fine-grained reactivity</strong>—without a virtual DOM.
        </p>
        <p>
          It works by tracking updates at the signal level and applying precise DOM updates. That
          means no re-renders, no diffing, and no unnecessary work.
        </p>

        <h2 class="mt-6">Why Vynn?</h2>
        <ul>
          <li>✅ React-like components with JSX</li>
          <li>⚡ Ultra-fast updates via signals and stores</li>
          <li>
            💡 Simple, composable primitives: <code>state()</code>, <code>store()</code>,{" "}
            <code>effect()</code>, <code>computed()</code>, and more
          </li>
          <li>
            🧼 Lifecycle hooks like <code>onMount()</code> and <code>onDestroy()</code>
          </li>
          <li>
            🪝 Built-in support for async resources and <code>&lt;Suspense&gt;</code>
          </li>
          <li>🌲 Fully tree-shakable and minimal by default</li>
        </ul>

        <h2 class="mt-6">How it feels</h2>
        <p>Here's a basic counter example:</p>

        <CodeBlock
          lang="tsx"
          code={`
            import { createApp, state } from "vynn";

            function App() {
              const count = state(0);

              return (
                <button onClick={() => count.value++}>
                  Count: {count.value}
                </button>
              );
            }

            createApp(App).mount("#app");
          `}
        />

        <p class="mt-4">
          This looks just like React—but <code>count.value</code> is reactive. When it changes, only
          that part of the DOM is updated.
        </p>

        <h2 class="mt-6">Core Concepts</h2>
        <ul>
          <li>
            <code>state()</code> — A reactive primitive for single values
          </li>
          <li>
            <code>store()</code> — Like <code>state()</code> but for objects and arrays
          </li>
          <li>
            <code>effect()</code> — Run code reactively when dependencies change
          </li>
          <li>
            <code>computed()</code> — Derived values that update automatically
          </li>
          <li>
            <code>onMount()</code> / <code>onDestroy()</code> — Lifecycle hooks
          </li>
          <li>
            <code>resource()</code> — Async data with <code>&lt;Suspense&gt;</code> support
          </li>
        </ul>

        <h2 class="mt-6">Want to dive deeper?</h2>
        <p>Check out the next sections:</p>
        <ul>
          <li>
            👉 <code>/docs/installation</code> — How to get started
          </li>
          <li>
            📖 <code>/docs/core-concepts/state</code> — Understand reactivity
          </li>
          <li>
            🚦 <code>/docs/routing</code> — Built-in router support
          </li>
        </ul>
      </section>
    </div>
  );
};
