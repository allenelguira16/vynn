import { CodeBlock } from "../components/CodeBlock";

export const ThingsToKnowPage = () => (
  <div>
    <h1>Before you build</h1>
    <section>
      <p>
        You can start writing Vynn components with the JSX and JavaScript you already know. There
        are just a few runtime ideas worth understanding early. They explain why Vynn code behaves
        the way it does, and they'll help you choose the right API without guessing.
      </p>
      <p>
        Don't worry about memorizing this entire page. The first few ideas come up every day. The
        rest are here as a handy reference when you start working with async UI, server rendering,
        or lower-level runtime features.
      </p>

      <h2 class="mt-6">The everyday ideas</h2>

      <h3 class="mt-4">1. Components create the UI; reactive values keep it up to date</h3>
      <p>
        A component function runs when Vynn creates that component. When a reactive value changes,
        Vynn updates the bindings and computations that read it. It doesn't call the entire
        component function again just to update a number on screen.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state } from "vynn";

function Counter() {
  console.log("Counter created");

  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Clicked {count.value} times
    </button>
  );
}
        `}
      />
      <p>
        Click the button in your app and watch the count change. The message in the console appears
        when the component is created, not on every click. The text expression is what follows
        <code>count.value</code>.
      </p>

      <h3 class="mt-4">2. A normal variable doesn't become reactive by association</h3>
      <p>
        JavaScript still behaves like JavaScript. A calculation assigned to a normal variable
        happens once, when that line runs. It won't magically recalculate just because one of its
        inputs is reactive.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const count = $state(1);

// A snapshot. It stays 2, even when count changes.
const snapshot = count.value * 2;

// A derived value. It follows count.
const doubled = $computed(() => count.value * 2);
        `}
      />
      <p>
        Use a direct JSX expression for something you only need to display, or use
        <code>$computed()</code> when you want to name and reuse a derived value.
      </p>

      <h3 class="mt-4">3. Pick the primitive that matches your data</h3>
      <p>
        You don't need to put every value in the same kind of container. Each primitive has a
        different job:
      </p>
      <div class="not-prose overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>API</th>
              <th>Use it for</th>
              <th>How you read it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>$state()</code></td>
              <td>One value you replace or update as a whole.</td>
              <td><code>value.value</code></td>
            </tr>
            <tr>
              <td><code>$store()</code></td>
              <td>Objects, arrays, and supported collections with reactive properties.</td>
              <td><code>store.name</code></td>
            </tr>
            <tr>
              <td><code>$computed()</code></td>
              <td>A read-only value calculated from other reactive values.</td>
              <td><code>result.value</code></td>
            </tr>
            <tr>
              <td><code>$effect()</code></td>
              <td>Synchronizing with something outside the UI.</td>
              <td>Runs its callback for you.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <CodeBlock
        lang="tsx"
        code={`
const selectedTab = $state("profile");

const user = $store({
  name: "Ada",
  preferences: { theme: "dark" },
});

const greeting = $computed(() => "Hello, " + user.name + "!");

selectedTab.value = "settings";
user.preferences.theme = "light";
        `}
      />
      <p>
        The quick question is: am I tracking one value, or do I want individual parts of an object
        to be reactive? That's usually enough to choose between <code>$state()</code> and
        <code>$store()</code>.
      </p>

      <h3 class="mt-4">4. You usually don't need an effect to calculate UI</h3>
      <p>
        It's tempting to copy values into another piece of state whenever something changes. Try
        not to. If a value can be calculated from other state, keep the calculation in JSX or
        <code>$computed()</code>. Save <code>$effect()</code> for work that needs to reach outside
        the reactive UI, like a browser API, subscription, timer, or logging service.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
// Avoid keeping a second value in sync with an effect.
const firstName = $state("Ada");
const lastName = $state("Lovelace");
const fullName = $computed(() => firstName.value + " " + lastName.value);

// Use an effect when syncing with something external.
$effect(() => {
  console.log("Full name changed:", fullName.value);
});
        `}
      />
      <p>
        Effects track the reactive values they read synchronously. If an effect creates a
        subscription, timer, or request, return a cleanup function so the previous work is stopped
        before the next run and when its owner is disposed.
      </p>
      <p>
        Keep the callback itself synchronous. Start async work inside it, handle failures there,
        and return cleanup immediately; Vynn doesn't wait for a Promise returned by the effect.
      </p>

      <h2 class="mt-6">When your data is asynchronous</h2>
      <p>
        You don't need a separate async primitive. Use an async initializer with
        <code>$state()</code> or <code>$store()</code>, or return a Promise from a
        <code>$computed()</code> getter.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const userId = $state("42");

const user = $state(async () => {
  // Read reactive inputs before the first await.
  const id = userId.value;
  const response = await fetch("/api/users/" + id);

  if (!response.ok) throw new Error("User not found");
  return response.json();
});
        `}
      />
      <p>
        There's one detail to remember: async <code>$state()</code> and
        <code>$store()</code> initializers must be declared with the <code>async</code> keyword.
        A regular function passed to <code>$state()</code> is just a function value. A
        <code>$computed()</code> getter is different: it can be a regular function that returns a
        Promise.
      </p>
      <p>
        Vynn collects reactive dependencies while the initializer or getter is running
        synchronously. For an async initializer, read the values that should trigger a refresh
        before the first <code>await</code>. After the first successful result, the previous value
        stays available while a newer request is pending.
      </p>

      <h3 class="mt-4">Choose how loading should look</h3>
      <ul>
        <li>
          Use <code>&lt;Await&gt;</code> when you want a fallback for the first pending read in a
          part of the component tree.
        </li>
        <li>
          Use <code>isPending()</code> when you want to control the loading indicator yourself,
          especially while existing data is being refreshed.
        </li>
        <li>
          Use <code>&lt;ErrorBoundary&gt;</code> for rendering errors. Pending work and failed work
          are different states, so a loading fallback is not an error handler.
        </li>
      </ul>

      <h2 class="mt-6">A component has a lifetime</h2>
      <p>
        Vynn associates components and reactive work with an owner. You can think of an owner as a
        cleanup scope: effects, child components, and registered callbacks belong to it. When a
        component is removed, Vynn disposes its owner and releases the work it owns.
      </p>
      <ul>
        <li>
          Use <code>onMount()</code> for browser setup after the component has mounted.
        </li>
        <li>
          Use <code>onDestroy()</code> to register cleanup when the component is disposed.
        </li>
        <li>
          Return a cleanup function from <code>$effect()</code> or <code>onMount()</code> when the
          cleanup belongs directly to that setup.
        </li>
      </ul>
      <p>
        Most application code never needs to create owners directly. The owner helpers are for
        integrations and reusable infrastructure that needs a separate, explicitly managed
        lifetime.
      </p>

      <h2 class="mt-6">Sharing values with context</h2>
      <p>
        <code>createContext()</code> lets a parent provide a value to its descendants without
        passing it through every component in between. Vynn passes the original value, not a copy.
        So if you provide a <code>$state()</code> ref or a <code>$store()</code> proxy, descendants
        receive that same reactive value. Context doesn't make a plain object reactive by itself.
      </p>

      <h2 class="mt-6">Client rendering and server rendering</h2>
      <p>
        These two client functions do different jobs:
      </p>
      <ul>
        <li>
          <code>renderToDOM()</code> creates a new client-rendered app in a DOM target.
        </li>
        <li>
          <code>hydrateToDOM()</code> connects the client runtime to matching HTML that the server
          has already rendered.
        </li>
      </ul>
      <p>
        Hydration expects the server and browser to start with the same component structure and
        initial data. If they disagree, Vynn may report a hydration mismatch.
      </p>
      <p>
        On the server, <code>renderToServer()</code> has three modes:
        <code>"sync"</code> renders synchronous content, <code>"async"</code> waits for pending
        work and returns a complete string, and <code>"stream"</code> can send fallbacks first and
        later deliver patches. The result also includes document-head information and module IDs
        reached during rendering.
      </p>

      <h2 class="mt-6">A few details you can come back to</h2>
      <ul>
        <li>
          <strong>Portals:</strong> <code>&lt;Portal&gt;</code> mounts children into a supplied DOM
          element on the client. Its children are not included in server-rendered HTML.
        </li>
        <li>
          <strong>Document metadata:</strong> supported <code>&lt;title&gt;</code>,
          <code>&lt;meta&gt;</code>, and <code>&lt;link&gt;</code> elements are collected from the
          component tree and tied to component ownership.
        </li>
        <li>
          <strong>Request context:</strong> <code>getRequestContext()</code> is a server-only API.
          It exposes the active request, cancellation signal, response metadata, cookies, and
          request-local values during SSR or server-function execution.
        </li>
      </ul>

      <h2 class="mt-6">Ready to keep going?</h2>
      <p>
        Start with <a href="/docs/reactivity/state">$state</a> and
        <a href="/docs/reactivity/store">$store</a>, then head to
        <a href="/docs/reactivity/computed">$computed</a> and
        <a href="/docs/reactivity/effect">$effect</a>. You can leave the rendering and request
        details until you need them.
      </p>
    </section>
  </div>
);
