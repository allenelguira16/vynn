import { CodeBlock } from "../components/CodeBlock";

export const StatePage = () => {
  return (
    <div>
      <h1>$state</h1>

      <section>
        <p>
          <code>$state()</code> creates a reactive value that you can read and update through its{" "}
          <code>.value</code> property. Vynn tracks where that value is used and updates the
          affected parts of your UI whenever it changes.
        </p>

        <p>
          Use <code>$state()</code> for values such as counters, form inputs, toggles, selected
          items, and other pieces of state that can change while your application is running.
        </p>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          Pass an initial value to <code>$state()</code>. Read it through
          <code>.value</code> and assign a new value whenever you need to update it.
        </p>

        <p>
          A normal function is stored as a function value. Only an <code>async</code> function is
          treated as an asynchronous initializer, so callbacks can still be stored in state without
          being invoked.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";
import { renderToDOM } from "vynn/client";

function Counter() {
  const count = $state(0);

  const handleCount = () => {
    count.value++;
  };

  return (
    <div>
      <p>Count: {count.value}</p>

      <button
        disabled={count.value > 5}
        onClick={handleCount}
      >
        Add counter
      </button>

      {count.value <= 3 ? <p>Hi!</p> : <p>That's enough.</p>}
    </div>
  );
}

renderToDOM(Counter, "#app");
          `}
        />

        <p>
          You can update the value using ordinary JavaScript assignments and operators. Vynn takes
          care of notifying the parts of the interface that depend on it.
        </p>

        <h2 class="mt-6">How reactivity works</h2>

        <p>
          Vynn tracks reactive values when they are read inside JSX,
          <code>$effect()</code>, <code>$computed()</code>, and other reactive computations.
        </p>

        <ul>
          <li>
            Reading <code>count.value</code> creates a dependency for the current reactive
            computation.
          </li>
          <li>
            Assigning a new value to <code>count.value</code> notifies computations that depend on
            it.
          </li>
          <li>Vynn updates the affected DOM bindings without re-running the entire component.</li>
        </ul>

        <h2 class="mt-6">Using $state with effects</h2>

        <p>
          You can also use state inside <code>$effect()</code> to run additional logic whenever its
          value changes.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $effect } from "vynn";

function Counter() {
  const count = $state(0);

  $effect(() => {
    console.log("Count changed:", count.value);
  });

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}
          `}
        />

        <p>
          The effect runs initially and runs again whenever
          <code>count.value</code> changes.
        </p>

        <h2 class="mt-6">Async state</h2>

        <p>
          <code>$state()</code> also accepts an async function. This creates writable async-derived
          state that runs immediately and tracks reactive dependencies read before the first
          <code>await</code>. When one of those dependencies changes, the initializer runs again.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await } from "vynn";

function Header() {
  const theme = $state(async () => {
    const response = await fetch("/api/theme");

    if (!response.ok) {
      throw new Error("Failed to load theme");
    }

    return (await response.json()) as string;
  });

  return (
    <Await fallback={<p>Loading theme...</p>}>
      <div>Theme: {theme.value}</div>
    </Await>
  );
}
          `}
        />

        <p>
          Reading <code>theme.value</code> while its first request is still pending suspends the
          component. The nearest
          <code>&lt;Await&gt;</code> handles this and displays its fallback until the value is
          available.
        </p>

        <h2 class="mt-6">Refreshing async state</h2>

        <p>
          Async state can depend on other reactive values. When one of those dependencies changes,
          Vynn runs the async function again.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await, isPending } from "vynn";

function UserProfile() {
  const userId = $state(1);

  const user = $state(async () => {
    const id = userId.value;
    const response = await fetch(\`/api/users/\${id}\`);

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return (await response.json()) as { name: string };
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <div>
        <p>Name: {user.value.name}</p>

        {isPending(user) ? <p>Refreshing...</p> : null}

        <button onClick={() => userId.value++}>
          Load next user
        </button>
      </div>
    </Await>
  );
}
          `}
        />

        <p>
          Unlike the initial request, subsequent requests keep the last resolved value available
          while the new request is running. This means your UI can continue showing the previous
          user while the next one loads.
        </p>

        <p>
          Async state remains writable through <code>.value</code>. Assigning a value manually
          replaces the current result and prevents an older in-flight request from overwriting that
          assignment when it finishes.
        </p>

        <p>
          Use <code>isPending()</code> to check whether the async state is currently refreshing and
          display an appropriate loading indicator.
        </p>

        <h2 class="mt-6">Using $state outside components</h2>

        <p>
          You can create state outside a component and import it wherever you need it. This is
          useful for sharing application state between components without passing it through props.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
// globalState.ts
import { $state } from "vynn";

export const theme = $state("light");

// Header.tsx
import { theme } from "./globalState";

export function Header() {
  return (
    <div>
      Current theme: {theme.value}

      <button
        onClick={() => {
          theme.value = theme.value === "light" ? "dark" : "light";
        }}
      >
        Toggle theme
      </button>
    </div>
  );
}
          `}
        />

        <p>
          Every component importing this state uses the same reactive value. Updating it in one
          component automatically updates the other components that read it.
        </p>

        <p>
          For server-rendered applications, be careful with mutable module-level state. Imported
          modules are shared, so user-specific state should be created within the appropriate
          application or request scope instead of being stored in a module-level singleton.
        </p>

        <h2 class="mt-6">When to use $store instead</h2>

        <p>
          <code>$state()</code> tracks its value as a whole. It does not make the properties of an
          ordinary object or array deeply reactive.
        </p>

        <p>
          When you need reactive properties inside an object or array, use <code>$store()</code>{" "}
          instead.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

const user = $store({
  name: "Allen",
  settings: {
    theme: "dark",
  },
});

user.name = "Michael";
user.settings.theme = "light";
          `}
        />

        <h2 class="mt-6">API Reference</h2>

        <h3>$state(initialValue)</h3>

        <p>Creates a mutable reactive value initialized with the supplied value.</p>

        <CodeBlock
          lang="tsx"
          code={`
const count = $state(0);

count.value++;
          `}
        />

        <h3>$state(async initializer)</h3>

        <p>
          Creates writable async-derived state from an async function. The function runs
          immediately, tracks reactive dependencies read before the first <code>await</code>, and
          retains the last resolved value while refreshing.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const user = $state(async () => {
  const response = await fetch("/api/user");
  return await response.json();
});
          `}
        />
      </section>
    </div>
  );
};
