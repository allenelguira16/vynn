import { CodeBlock } from "../components/CodeBlock";

export const ThingsToKnowPage = () => (
  <div>
    <h1>Things to know</h1>
    <section>
      <p>
        Vynn uses JSX, but its runtime model is based on fine-grained dependencies and component
        ownership. Understanding a few rules makes the rest of the core API much easier to use.
      </p>

      <h2 class="mt-6">1. Components are created once</h2>
      <p>
        A component function runs when Vynn creates that component. Updating reactive state does not
        automatically call the component function again. Instead, Vynn updates the specific bindings
        and computations that read the changed values.
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
      Count: {count.value}
    </button>
  );
}
      `}
      />
      <p>
        Clicking the button updates its text. The component's
        <code>console.log()</code> does not run again.
      </p>

      <h2 class="mt-6">2. A normal variable is a snapshot</h2>
      <p>
        JavaScript calculations run when the component code reaches them. Reading a reactive value
        into a normal variable does not make that variable reactive.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const count = $state(1);

// Snapshot: this stays 2.
const snapshot = count.value * 2;

// Derived ref: this follows count.
const doubled = $computed(() => count.value * 2);
      `}
      />
      <p>
        Use a JSX expression for a direct reactive read, or use
        <code>$computed()</code> when you need a reusable derived value.
      </p>

      <h2 class="mt-6">3. Choose state or store based on the shape of the data</h2>
      <p>
        <code>$state()</code> tracks one value through <code>.value</code>. It does not deeply proxy
        the properties of an object.
        <code>$store()</code> creates reactive access to nested plain objects, arrays, and supported
        native collections.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const selectedTab = $state("profile");

const user = $store({
  name: "Ada",
  preferences: {
    theme: "dark",
  },
});

selectedTab.value = "settings";
user.preferences.theme = "light";
      `}
      />
      <p>
        Use <code>$state()</code> for scalar values, references, and replaceable values. Use{" "}
        <code>$store()</code> when consumers need property-level and structural reactivity.
      </p>

      <h2 class="mt-6">4. Async resources use the same reactive primitives</h2>
      <p>
        There is no separate public <code>$async()</code> primitive. Use async initializers with{" "}
        <code>$state()</code> or
        <code>$store()</code>, or return a Promise from a<code>$computed()</code> getter.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const userId = $state("42");

// Async state is writable.
const user = $state(async () => {
  const id = userId.value;
  const response = await fetch("/api/users/" + id);
  if (!response.ok) throw new Error("User not found");
  return response.json();
});

// Async computed is read-only.
const posts = $computed(() => fetchPosts(userId.value));
      `}
      />
      <p>
        For async <code>$state()</code> and <code>$store()</code>
        initializers, declare the initializer as an <code>async</code>
        function. A normal function value passed to <code>$state()</code>
        is stored as a function value. <code>$computed()</code>, by contrast, detects a Promise
        returned by its getter.
      </p>
      <p>
        Reactive reads are collected while the initializer or getter is executing synchronously. For
        async initializers, read the reactive inputs before the first <code>await</code>. After a
        resource has resolved once, it retains its previous value while a refresh is pending.
      </p>

      <h2 class="mt-6">5. Await and isPending solve different UI needs</h2>
      <p>
        Use <code>&lt;Await&gt;</code> when you want an async boundary to show a fallback for the
        initial pending render. Use
        <code>isPending()</code> when you want to control the loading UI yourself. After the first
        successful result, refreshes keep the current value available and can be shown with a small
        updating indicator.
      </p>
      <p>
        Pending work is not the same as a failed request.
        <code>&lt;Await&gt;</code> handles suspension; pair it with
        <code>&lt;ErrorBoundary&gt;</code> when rendering errors need a fallback.
      </p>

      <h2 class="mt-6">6. Effects are for external side effects</h2>
      <p>
        Prefer JSX bindings and computed values for UI updates. Use
        <code>$effect()</code> to synchronize with something outside the reactive view, such as a
        browser API, subscription, timer, or log. Effects run initially and track synchronous
        reactive reads.
      </p>
      <p>
        Return a cleanup function for resources that must be replaced or released. Vynn runs the
        previous cleanup before the next effect execution and when the owning scope is disposed.
        Keep effect callbacks synchronous; start asynchronous work inside them and return cleanup
        immediately.
      </p>

      <h2 class="mt-6">7. Component lifetimes own cleanup</h2>
      <p>
        Components, effects, and other runtime work are associated with an owner.{" "}
        <code>onMount()</code> runs in the browser after mounting, while <code>onDestroy()</code>{" "}
        registers cleanup for disposal. Component-owned event listeners and effects are also
        disposed with their owner.
      </p>
      <p>
        Use <code>createOwner()</code>, <code>runWithOwner()</code>, and
        <code>disposeOwner()</code> only when you need to create an explicit lifetime scope. Most
        application components should rely on the automatic owner created by Vynn.
      </p>

      <h2 class="mt-6">8. Context shares a reference, not a copy</h2>
      <p>
        <code>createContext()</code> provides a value to descendant components. If you pass a{" "}
        <code>$state()</code> ref or a<code>$store()</code> proxy, consumers receive that same
        reactive reference. Context does not clone the object or make a plain value reactive by
        itself.
      </p>

      <h2 class="mt-6">9. Portals are client-only</h2>
      <p>
        <code>&lt;Portal&gt;</code> inserts its children into a supplied DOM element after the
        component mounts. It returns no content at its original position and does not render its
        portal children during SSR. Do not place content that must exist in the initial server
        document exclusively inside a portal.
      </p>

      <h2 class="mt-6">10. Client rendering and hydration are different operations</h2>
      <p>
        <code>renderToDOM()</code> creates a new client-rendered tree.
        <code>hydrateToDOM()</code> attaches the client runtime to markup that was already rendered
        by the matching server application. Hydration expects the same initial application structure
        and data that produced the server HTML.
      </p>

      <h2 class="mt-6">11. Server rendering has explicit modes</h2>
      <p>
        <code>renderToServer()</code> supports <code>"sync"</code>,<code>"async"</code>, and{" "}
        <code>"stream"</code>. Async mode waits for pending render work and returns a completed
        string. Stream mode returns a byte stream that can send fallbacks and later patches. The
        result also contains a head manager and the set of modules reached during the render.
      </p>

      <h2 class="mt-6">12. Document metadata follows component ownership</h2>
      <p>
        Vynn manages supported <code>&lt;title&gt;</code>,<code>&lt;meta&gt;</code>, and{" "}
        <code>&lt;link&gt;</code> metadata collected from the component tree. Metadata registered by
        a component is removed when that component is disposed, allowing another active registration
        with the same identity to take over.
      </p>

      <h2 class="mt-6">13. Request context belongs on the server</h2>
      <p>
        <code>getRequestContext()</code> is available during a server render when a Request is
        supplied, and during server-function execution. It exposes the incoming request,
        cancellation signal, response metadata, cookie helpers, and request-local values. It is not
        a browser API and should only be imported by server-side code.
      </p>
    </section>
  </div>
);
