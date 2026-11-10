import { CodeBlock } from "../components/CodeBlock";

export const IntroductionPage = () => (
  <div>
    <h1>Vynn Core</h1>
    <section>
      <p>
        <strong>Vynn</strong> is a TypeScript UI runtime for building browser interfaces with JSX
        and fine-grained reactivity. Components create their UI and reactive computations; changes
        are then propagated to the specific expressions, attributes, and effects that depend on
        them.
      </p>
      <p>
        This guide covers <code>vynn-core</code>: reactive primitives, component utilities,
        lifecycle, client rendering, server rendering, and the server-function runtime. The Vynn
        compiler and Vynn router have their own documentation and are intentionally outside this
        guide.
      </p>

      <h2 class="mt-6">A first component</h2>
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
      <p>
        <code>$state()</code> creates a reactive value. Reading
        <code>count.value</code> inside JSX establishes a dependency. Updating that value updates
        the affected text without calling the component function again.
      </p>

      <h2 class="mt-6">The core building blocks</h2>
      <ul>
        <li>
          <strong>
            <code>$state()</code>
          </strong>{" "}
          stores one reactive value and also supports writable asynchronous derived state.
        </li>
        <li>
          <strong>
            <code>$store()</code>
          </strong>{" "}
          creates a deeply reactive proxy for objects, arrays, and supported native collections.
        </li>
        <li>
          <strong>
            <code>$computed()</code>
          </strong>{" "}
          derives a read-only value from other reactive values. Its getter can be synchronous or
          asynchronous.
        </li>
        <li>
          <strong>
            <code>$effect()</code>
          </strong>{" "}
          runs side effects when reactive values read by its callback change.
        </li>
        <li>
          <strong>
            <code>isPending()</code> and <code>&lt;Await&gt;</code>
          </strong>{" "}
          let you handle the initial pending state of asynchronous resources.
        </li>
        <li>
          <strong>
            <code>createContext()</code>
          </strong>{" "}
          shares a value with descendants without threading it through every component.
        </li>
        <li>
          <strong>
            <code>onMount()</code> and <code>onDestroy()</code>
          </strong>{" "}
          attach setup and cleanup work to a component's lifetime.
        </li>
        <li>
          <strong>
            <code>&lt;ErrorBoundary&gt;</code>, <code>lazy()</code>, and <code>&lt;Portal&gt;</code>
          </strong>{" "}
          provide error handling, lazy component loading, and rendering into another DOM node.
        </li>
      </ul>

      <h2 class="mt-6">Core entry points</h2>
      <p>
        Most reactive primitives and components come from the package root. Rendering functions live
        in dedicated entry points so browser and server code can import only the runtime they need.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $effect, $state, $store, Await } from "vynn";
import { renderToDOM, hydrateToDOM } from "vynn/client";
import { renderToServer } from "vynn/server";
import { createListener } from "vynn/server/node";
      `}
      />
      <ul>
        <li>
          <code>vynn</code>: reactive primitives, components, context, lifecycle APIs, and core
          TypeScript types.
        </li>
        <li>
          <code>vynn/client</code>: <code>renderToDOM()</code> and <code>hydrateToDOM()</code>.
        </li>
        <li>
          <code>vynn/server</code>: <code>renderToServer()</code>, server-function runtime, and SSR
          helpers.
        </li>
        <li>
          <code>vynn/server/node</code>: adapters between Node HTTP and Web-standard
          Request/Response objects.
        </li>
        <li>
          <code>vynn/server-functions/client</code>: client-side server-function references and
          invocation helpers.
        </li>
      </ul>

      <h2 class="mt-6">Where to go next</h2>
      <p>
        Learn the reactive primitives first, then explore async rendering, component utilities, and
        the runtime entry points.
      </p>
      <ul>
        <li>
          <code>/docs/reactivity/state</code> - primitive and asynchronous state.
        </li>
        <li>
          <code>/docs/reactivity/store</code> - nested objects, arrays, and collections.
        </li>
        <li>
          <code>/docs/reactivity/computed</code> - synchronous and asynchronous derived values.
        </li>
        <li>
          <code>/docs/rendering/client</code> and <code>/docs/rendering/server</code> - mounting,
          hydration, and SSR.
        </li>
        <li>
          <code>/docs/life-cycles/owners</code> - the owner lifecycle behind component-scoped work.
        </li>
        <li>
          <code>/docs/utilities/types</code> - JSX and component prop types.
        </li>
        <li>
          <code>/docs/server/functions</code> - the client/server function runtime.
        </li>
      </ul>
    </section>
  </div>
);
