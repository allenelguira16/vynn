import { CodeBlock } from "../../../../components/code-block";

const IntroductionPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Get started</p>
    <h1>Welcome to Vynn</h1>
    <p class="lead">
      Vynn is a TypeScript UI framework for building web interfaces with JSX and fine-grained
      reactivity.
    </p>

    <p>
      You write components as ordinary functions and describe their output with JSX. When reactive
      data changes, Vynn updates the bindings that depend on it instead of repeatedly comparing an
      entire virtual DOM tree.
    </p>

    <h2>Three ideas to know first</h2>
    <div class="not-prose my-6 grid gap-3 sm:grid-cols-3">
      <div class="rounded-box border border-base-300 p-4">
        <p class="mb-2 font-semibold">Components</p>
        <p class="text-sm leading-6 text-base-content/70">
          Functions that return JSX and compose into larger interfaces.
        </p>
      </div>
      <div class="rounded-box border border-base-300 p-4">
        <p class="mb-2 font-semibold">Reactive state</p>
        <p class="text-sm leading-6 text-base-content/70">
          Values that notify the parts of the UI reading them.
        </p>
      </div>
      <div class="rounded-box border border-base-300 p-4">
        <p class="mb-2 font-semibold">Derived values</p>
        <p class="text-sm leading-6 text-base-content/70">
          Computed data that stays in sync with its dependencies.
        </p>
      </div>
    </div>

    <h2>Your first component</h2>
    <p>
      A counter is enough to see the basic pattern. Create state with <code>$state()</code>, read
      its <code>value</code> in JSX, and update it from an event handler.
    </p>
    <CodeBlock
      lang="tsx"
      code={`
import { $state } from "vynn";

export function Counter() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}
      `}
    />

    <h2>What makes Vynn different?</h2>
    <p>
      Vynn combines a JSX component model with explicit reactive primitives. Use
      <code>$state()</code> for a single value, <code>$store()</code> for a reactive object, and
      <code>$computed()</code> for a value derived from other state. You do not need a hook for
      every piece of reactive data.
    </p>

    <h2>How to think about a Vynn screen</h2>
    <p>A useful way to follow a Vynn component is to trace the data from its source to the DOM:</p>
    <ol>
      <li>
        <strong>Create the data.</strong> Use <code>$state()</code> for a single value or
        <code>$store()</code> for a structured object.
      </li>
      <li>
        <strong>Derive what the UI needs.</strong> Use <code>$computed()</code> for values that can
        be calculated from other reactive data.
      </li>
      <li>
        <strong>Read the data in JSX.</strong> Vynn's compiler connects those reads to the DOM
        bindings that display them.
      </li>
      <li>
        <strong>Keep external work separate.</strong> Use <code>$effect()</code> for browser APIs,
        subscriptions, and other side effects rather than copying derived values between states.
      </li>
    </ol>
    <p>
      This is the core of fine-grained reactivity: when a dependency changes, Vynn updates the
      bindings that read it. Your component code stays focused on describing the interface and how
      its data relates.
    </p>

    <h2>Choose how the app renders</h2>
    <p>
      A Vite app starts in client-rendered mode with <code>vynn()</code>. Enable
      <code>ssr: true</code> when the server should generate the initial document and the browser
      should hydrate it. Both modes use the same component and reactivity APIs; the difference is
      where the first render happens.
    </p>

    <h2>Where to go next</h2>
    <ul>
      <li>
        <a href="/docs/getting-started/installation">Install Vynn</a> and configure your project.
      </li>
      <li>
        Follow the <a href="/docs/getting-started/quick-start">quick start</a> to build a working
        app.
      </li>
      <li>
        Learn the <a href="/docs/core-concepts/reactivity">reactivity model</a> behind
        <code>$state</code>, <code>$store</code>, and <code>$computed</code>.
      </li>
    </ul>
  </article>
);


export default IntroductionPage;
