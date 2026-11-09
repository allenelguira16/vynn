import { CodeBlock } from "../components/CodeBlock";

export const IntroductionPage = () => {
  return (
    <div>
      <h1>Introduction</h1>

      <section>
        <p>
          <strong>Vynn</strong> is a TypeScript UI framework for building reactive web applications
          with JSX. It combines familiar component composition with fine-grained reactivity,
          updating the DOM directly when the values it depends on change.
        </p>

        <p>
          Instead of re-rendering components and comparing virtual DOM trees, Vynn tracks reactive
          dependencies and updates only the affected parts of the interface. You can write your UI
          using components, ordinary JavaScript, and a small set of reactive primitives.
        </p>

        <h2 class="mt-6">Why Vynn?</h2>

        <ul>
          <li>Write components using TypeScript and JSX.</li>
          <li>
            Build reactive interfaces with <code>$state()</code> and
            <code> $store()</code>.
          </li>
          <li>
            Derive values with <code>$computed()</code> and run side effects with{" "}
            <code>$effect()</code>.
          </li>
          <li>Organize shared logic and application state using contexts.</li>
          <li>
            Handle asynchronous resources with <code>$async()</code> and
            <code>&lt;Await&gt;</code>.
          </li>
          <li>
            Handle rendering errors with <code>&lt;ErrorBoundary&gt;</code>.
          </li>
          <li>Render applications on the server and hydrate them in the browser.</li>
          <li>Use the Vynn router for client-side navigation and route handling.</li>
        </ul>

        <h2 class="mt-6">How it works</h2>

        <p>Here's a simple counter:</p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";
import { renderToDOM } from "vynn/client";

function App() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}

renderToDOM(App, "#app");
          `}
        />

        <p>
          <code>$state()</code> creates a reactive value. When
          <code>count.value</code> changes, Vynn updates the text displayed inside the button
          without re-running the entire component.
        </p>

        <p>
          You don't need to manually subscribe to changes or tell Vynn which parts of the UI should
          update. Dependencies are tracked as your application runs.
        </p>

        <h2 class="mt-6">Core concepts</h2>

        <ul>
          <li>
            <strong>
              <code>$state()</code>
            </strong>{" "}
            - Holds a reactive value. It also supports asynchronous derived state.
          </li>
          <li>
            <strong>
              <code>$store()</code>
            </strong>{" "}
            - Creates a deeply reactive object or array.
          </li>
          <li>
            <strong>
              <code>$computed()</code>
            </strong>{" "}
            - Derives a value from other reactive values.
          </li>
          <li>
            <strong>
              <code>$effect()</code>
            </strong>{" "}
            - Runs side effects when their reactive dependencies change.
          </li>
          <li>
            <strong>
              <code>$async()</code>
            </strong>{" "}
            - Manages asynchronous computations that can suspend while pending.
          </li>
          <li>
            <strong>
              <code>createContext()</code>
            </strong>{" "}
            - Shares values between components without passing them through every level.
          </li>
          <li>
            <strong>
              <code>onMount()</code> and <code>onDestroy()</code>
            </strong>{" "}
            - Run code when a component is mounted or destroyed.
          </li>
        </ul>

        <h2 class="mt-6">Where to go next</h2>

        <p>
          If you're new to Vynn, start with the installation guide and work through the core
          concepts. You can explore the other features once you're comfortable with the basics.
        </p>

        <ul>
          <li>
            <code>/docs/installation</code> - Install Vynn and set up your project.
          </li>
          <li>
            <code>/docs/core-concepts/state</code> - Learn how reactive state works.
          </li>
          <li>
            <code>/docs/core-concepts/store</code> - Work with reactive objects and arrays.
          </li>
          <li>
            <code>/docs/routing</code> - Add navigation and route handling.
          </li>
        </ul>
      </section>
    </div>
  );
};
