import { $state } from "vynn";

import { Link } from "vynn-router";

import { CodeBlock } from "../components/CodeBlock";

export const IntroductionPage = () => {
  const count = $state(0);

  return (
    <div>
      <h1>Welcome to Vynn</h1>

      <section>
        <p>
          Vynn is a TypeScript UI runtime for building interfaces with JSX and fine-grained
          reactivity. You write components, give them reactive data, and let Vynn keep the UI in
          sync as that data changes.
        </p>
        <p>
          You don't need to understand the whole runtime before you can build something useful.
          Let's start with one small component, see what Vynn does for you, and then map out where to
          go next.
        </p>

        <h2 class="mt-6">Your first Vynn component</h2>
        <p>
          Here's a counter. It has one value and one button. Click the button a few times; the
          number below is a real, reactive example, not just a picture of one.
        </p>

        <div class="not-prose my-5 rounded-xl border border-base-300 bg-base-200/40 p-5">
          <p class="mb-3 text-sm text-base-content/70">Try the counter</p>
          <div class="flex flex-wrap items-center gap-3">
            <button class="btn btn-primary" onClick={() => count.value++}>
              Add one
            </button>
            <button
              class="btn btn-ghost"
              onClick={() => {
                count.value = 0;
              }}
            >
              Reset
            </button>
            <p class="font-medium">Count: {count.value}</p>
          </div>
          <p class="mt-3 text-sm text-base-content/70">
            Current value: {count.value}. Keep clicking. Only the parts that use this value need to
            update.
          </p>
        </div>

        <p>And here's the component behind that little example:</p>
        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";

function Counter() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}
          `}
        />

        <h3 class="mt-4">What's happening here?</h3>
        <ol>
          <li>
            <code>$state(0)</code> creates a reactive value that starts at <code>0</code>.
          </li>
          <li>
            <code>count.value</code> reads the current value. Because the read happens in JSX, Vynn
            knows that this text depends on it.
          </li>
          <li>
            Clicking the button runs the event handler and changes <code>count.value</code>.
          </li>
          <li>
            Vynn updates the text that used the value. It doesn't need to call the whole
            <code>Counter</code> function again.
          </li>
        </ol>
        <p>
          That's the heart of Vynn: write ordinary-looking JavaScript, and let reactive reads tell
          Vynn what needs to stay in sync.
        </p>

        <h2 class="mt-6">A quick map of the core APIs</h2>
        <p>
          You'll see a handful of primitives throughout the guide. You don't need to memorize them
          yet. This table is here so you can choose a starting point when a particular problem comes
          up.
        </p>
        <div class="not-prose overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>When you need to…</th>
                <th>Reach for</th>
                <th>What it gives you</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Keep one value reactive</td>
                <td><code>$state()</code></td>
                <td>A writable value read and updated through <code>.value</code>.</td>
              </tr>
              <tr>
                <td>Work with nested object data</td>
                <td><code>$store()</code></td>
                <td>A reactive object you can read and mutate directly.</td>
              </tr>
              <tr>
                <td>Calculate a value from other state</td>
                <td><code>$computed()</code></td>
                <td>A read-only derived value.</td>
              </tr>
              <tr>
                <td>Talk to something outside the UI</td>
                <td><code>$effect()</code></td>
                <td>A tracked place for subscriptions, browser APIs, and other side effects.</td>
              </tr>
              <tr>
                <td>Show async loading states</td>
                <td><code>Await</code> / <code>isPending()</code></td>
                <td>A fallback for the first load or a refresh indicator.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 class="mt-6">How the rest of Vynn fits together</h2>
        <p>
          Components are the building blocks of your interface. Reactivity connects those components
          to the data they use. The rest of the core APIs help you manage the work around them:
        </p>
        <ul>
          <li>
            <strong>Component composition:</strong> build larger screens from smaller function
            components.
          </li>
          <li>
            <strong>Context:</strong> share a value with descendants without passing it through every
            component in between.
          </li>
          <li>
            <strong>Lifecycle:</strong> use <code>onMount()</code> for browser setup and
            <code>onDestroy()</code> for cleanup.
          </li>
          <li>
            <strong>Async UI:</strong> use async state, stores, or computed values with
            <code>&lt;Await&gt;</code>, <code>isPending()</code>, and
            <code>&lt;ErrorBoundary&gt;</code>.
          </li>
          <li>
            <strong>Rendering:</strong> mount an app in the browser, hydrate server-rendered HTML, or
            render HTML on the server.
          </li>
        </ul>

        <h2 class="mt-6">Where should you go next?</h2>
        <p>
          New to Vynn? Follow this path. Each page builds on the previous one, so you can learn a
          little at a time:
        </p>
        <ol>
          <li>
            <Link href="/docs/getting-started/installation">Install Vynn</Link> and connect your JSX
            tooling.
          </li>
          <li>
            Learn <Link href="/docs/reactivity/state">$state</Link> for individual values and
            <Link href="/docs/reactivity/store">$store</Link> for structured data.
          </li>
          <li>
            Use <Link href="/docs/reactivity/computed">$computed</Link> for derived values and
            <Link href="/docs/reactivity/effect">$effect</Link> when you need to synchronize with the
            outside world.
          </li>
          <li>
            Explore <Link href="/docs/components/await">async UI</Link>, then learn about
            <Link href="/docs/life-cycles/on-mount">component lifecycles</Link> and
            <Link href="/docs/utilities/context">context</Link>.
          </li>
          <li>
            When you're ready, take a look at
            <Link href="/docs/rendering/client">client rendering</Link> and
            <Link href="/docs/rendering/server">server rendering</Link>.
          </li>
        </ol>
        <p>
          Already comfortable with reactive frameworks? Jump straight to the API you're interested
          in. The same examples and deeper behavior notes are there when you need them.
        </p>

        <h2 class="mt-6">A note about Vynn's packages</h2>
        <p>
          Most everyday APIs come from <code>vynn</code>. Rendering has its own entry points so you
          can keep browser and server code separate:
        </p>
        <ul>
          <li><code>vynn</code>: state, stores, computed values, components, context, and lifecycle.</li>
          <li><code>vynn/client</code>: <code>renderToDOM()</code> and <code>hydrateToDOM()</code>.</li>
          <li><code>vynn/server</code>: <code>renderToServer()</code> and server-side runtime helpers.</li>
          <li><code>vynn/server/node</code>: adapters for Node HTTP servers.</li>
          <li>
            <code>vynn/server-functions/client</code>: browser-side server-function references.
          </li>
        </ul>
        <p>
          The Vynn compiler and router are separate packages. Their setup and APIs have their own
          guides, so this one can stay focused on building and rendering components.
        </p>
      </section>
    </div>
  );
};
