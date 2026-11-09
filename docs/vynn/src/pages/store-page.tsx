import { CodeBlock } from "../components/CodeBlock";

export const StorePage = () => {
  return (
    <div>
      <h1>$store</h1>

      <section>
        <p>
          <code>$store()</code> creates a deeply reactive object or array. Unlike{" "}
          <code>$state()</code>, which tracks its value as a whole,
          <code>$store()</code> tracks individual properties, including properties inside nested
          objects and arrays.
        </p>

        <p>
          You can read and update properties directly using ordinary JavaScript syntax. Vynn tracks
          which properties your UI and reactive computations access, then updates the parts that
          depend on those properties when they change.
        </p>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          Pass an object or array to <code>$store()</code>. You can access and modify its properties
          without using <code>.value</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";
import { renderToDOM } from "vynn/client";

function Counter() {
  const state = $store({
    count: 0,
  });

  const handleCount = () => {
    state.count++;
  };

  return (
    <div>
      <div>Count: {state.count}</div>

      <button
        disabled={state.count > 5}
        onClick={handleCount}
      >
        Add counter
      </button>

      {state.count <= 3 ? <p>Hi!</p> : <p>That's enough.</p>}
    </div>
  );
}

renderToDOM(Counter, "#app");
          `}
        />

        <p>
          When <code>state.count</code> changes, Vynn updates the DOM bindings that read that
          property. You don't need to replace the entire object or manually notify Vynn about the
          change.
        </p>

        <h2 class="mt-6">Nested reactivity</h2>

        <p>
          Nested objects and arrays are reactive too. You don't need to create separate{" "}
          <code>$state()</code> or <code>$store()</code>
          values for every property.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

function Profile() {
  const user = $store({
    name: "Allen",
    settings: {
      theme: "dark",
    },
    hobbies: ["Guitar", "Programming"],
  });

  return (
    <div>
      <p>Name: {user.name}</p>
      <p>Theme: {user.settings.theme}</p>
      <p>Hobbies: {user.hobbies.join(", ")}</p>

      <button
        onClick={() => {
          user.settings.theme = "light";
        }}
      >
        Change theme
      </button>

      <button
        onClick={() => {
          user.hobbies.push("Anime");
        }}
      >
        Add hobby
      </button>
    </div>
  );
}
          `}
        />

        <p>
          Assigning a nested property or modifying an array automatically notifies the computations
          that depend on the affected properties. The same applies to adding and deleting object
          properties.
        </p>

        <h2 class="mt-6">Derived values with getters</h2>

        <p>
          You can define JavaScript getters directly inside a store. This is useful for values that
          can be calculated from other properties in the same object.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

function Counter() {
  const state = $store({
    count: 0,

    get double() {
      return this.count * 2;
    },
  });

  return (
    <div>
      <p>Count: {state.count}</p>
      <p>Double: {state.double}</p>

      <button onClick={() => state.count++}>
        Add counter
      </button>
    </div>
  );
}
          `}
        />

        <p>
          The getter runs whenever <code>state.double</code> is accessed. Because it reads{" "}
          <code>this.count</code> through the reactive store, Vynn tracks that dependency and
          updates consumers when the count changes.
        </p>

        <p>
          Getters are not separately memoized. They are evaluated on access, so use{" "}
          <code>$computed()</code> when you need a dedicated derived reactive value or want to reuse
          derived logic outside the store.
        </p>

        <h2 class="mt-6">Async stores</h2>

        <p>
          <code>$store()</code> also accepts an async function that loads an object. This is useful
          when your application needs to fetch structured data and work with it as a reactive store.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store, Await, isPending } from "vynn";

type Theme = {
  version: number;
  theme: "alpha" | "omega" | "sapphire";
};

function Header() {
  const theme = $store(async () => {
    const response = await fetch("/api/theme-full");

    if (!response.ok) {
      throw new Error("Failed to load theme");
    }

    return (await response.json()) as Theme;
  });

  return (
    <Await fallback={<p>Loading theme...</p>}>
      <div>
        <p>Theme: {theme.theme}</p>
        <p>Version: {theme.version}</p>

        {isPending(theme) ? <p>Refreshing theme...</p> : null}
      </div>
    </Await>
  );
}
          `}
        />

        <p>
          On the initial load, accessing the store's properties suspends while the request is
          pending. The nearest
          <code>&lt;Await&gt;</code> handles that pending state and displays its fallback.
        </p>

        <p>
          When the request finishes, Vynn makes the resolved object's properties available through
          the store. You can access and update them just like properties on an ordinary
          <code>$store()</code>.
        </p>

        <h2 class="mt-6">Refreshing async stores</h2>

        <p>
          An async store can depend on other reactive values. When a dependency changes, Vynn runs
          the async function again and reconciles the new result into the existing store.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $store, Await, isPending } from "vynn";

function UserProfile() {
  const userId = $state(1);

  const user = $store(async () => {
    const id = userId.value;
    const response = await fetch(\`/api/users/\${id}\`);

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return (await response.json()) as {
      name: string;
      email: string;
    };
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <div>
        <p>Name: {user.name}</p>
        <p>Email: {user.email}</p>

        {isPending(user) ? <p>Refreshing user...</p> : null}

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
          During a refresh, the store keeps its previously resolved data available. Once the new
          request finishes, Vynn reconciles the returned object into the existing store instead of
          replacing the root store proxy.
        </p>

        <p>
          Use <code>isPending()</code> when you need to show a refresh indicator without hiding the
          data that is already on screen.
        </p>

        <p>
          Async store initializers must resolve to plain objects. For asynchronous values that
          aren't objects, use async
          <code>$state()</code> or <code>$computed()</code> instead.
        </p>

        <h2 class="mt-6">Using stores outside components</h2>

        <p>
          You can also create a store outside a component and import it wherever you need it. This
          is useful for sharing state between components.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
 // globalState.ts
import { $store } from "vynn";

export const settings = $store({
  theme: "light",
});

// Header.tsx
import { settings } from "./globalState";

export function Header() {
  return (
    <div>
      <p>Theme: {settings.theme}</p>

      <button
        onClick={() => {
          settings.theme =
            settings.theme === "light" ? "dark" : "light";
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
          Components importing the same store share the same reactive object. Updating a property in
          one component automatically updates other components that depend on it.
        </p>

        <p>
          For server-rendered applications, avoid putting user-specific mutable state in a
          module-level store. Modules can be shared across requests, so create request-specific
          state within the appropriate application scope instead.
        </p>

        <h2 class="mt-6">When to use $state instead</h2>

        <p>
          Use <code>$state()</code> when you only need to track a value as a whole, such as a
          number, string, boolean, or a reference that you replace entirely.
        </p>

        <p>
          Use <code>$store()</code> when you need individual properties inside an object or array to
          be independently reactive.
        </p>

        <h2 class="mt-6">API Reference</h2>

        <h3>$store(initialObject)</h3>

        <p>
          Creates a deeply reactive proxy from an object or array. Property reads are tracked, and
          writes notify dependent computations.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const state = $store({
  count: 0,
  user: {
    name: "Allen",
  },
});

state.count++;
state.user.name = "Michael";
          `}
        />

        <h3>$store(async initializer)</h3>

        <p>
          Creates a reactive store from an async function that resolves to a plain object. Reactive
          dependencies read before the first
          <code>await</code> trigger subsequent refreshes.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const user = $store(async () => {
  const response = await fetch("/api/user");
  return await response.json();
});
          `}
        />
      </section>
    </div>
  );
};
