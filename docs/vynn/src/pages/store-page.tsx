import { CodeBlock } from "../components/CodeBlock";

export const StorePage = () => {
  return (
    <div>
      <h1>$store</h1>

      <section>
        <p>
          <code>$store()</code> is for state with structure: objects, arrays, and supported native
          collections. It wraps that data in a reactive proxy, so Vynn can track the properties,
          entries, and iterations your UI actually reads. Unlike <code>$state()</code>, you work
          with a store directly instead of going through <code>.value</code>.
        </p>

        <p>
          The nice part is that your code still looks like regular JavaScript. Read
          <code>user.name</code>, change <code>user.settings.theme</code>, or call
          <code>items.push()</code>. Vynn remembers which pieces were read and updates only the
          dependent bindings when those pieces change.
        </p>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          Pass an object or array to <code>$store()</code>, then work with its properties directly.
          There's no <code>.value</code> wrapper: read <code>profile.name</code>, assign to
          <code>profile.settings.theme</code>, and let Vynn keep the UI in sync.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

function ProfileCard() {
  const profile = $store({
    name: "Ada",
    settings: {
      theme: "dark",
    },
  });

  return (
    <section>
      <h2>{profile.name}</h2>
      <p>Theme: {profile.settings.theme}</p>

      <button
        onClick={() => {
          profile.settings.theme =
            profile.settings.theme === "dark" ? "light" : "dark";
        }}
      >
        Toggle theme
      </button>
    </section>
  );
}
          `}
        />

        <p>
          That's the everyday experience of a store: mutate the data where it lives. Vynn tracks
          which properties the UI reads, then updates those bindings when the properties change.
          You don't need to replace the whole object or manually notify anything.
        </p>
        <p>
          <strong>Try it:</strong> add a <code>city</code> property to the profile and display it.
          Then add a button that changes the city.
        </p>

        <h2 class="mt-6">Nested reactivity</h2>

        <p>
          Nested objects and arrays are reactive as well. You can keep related data together instead
          of creating a separate <code>$state()</code> for every field. When you access a nested
          object or array, Vynn gives you its reactive proxy automatically.
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

        <h2 class="mt-6">Going deeper: structural reactivity</h2>

        <p>
          A store also knows when its shape changes. That means checks such as <code>"name" in user</code>
          and calls such as <code>Object.keys(user)</code> are reactive too. Adding or removing a
          property updates consumers that care about the object's structure, even when the
          property's value happens to be <code>undefined</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $effect, $store } from "vynn";

function UserFields() {
  const user = $store<{ name?: string }>({});

  $effect(() => {
    console.log("Has name:", "name" in user);
  });

  $effect(() => {
    console.log("Fields:", Object.keys(user));
  });

  return (
    <button onClick={() => (user.name = "Allen")}>
      Add name
    </button>
  );
}
          `}
        />

        <p>
          These dependencies are distinct from reading <code>user.name</code>. For example, adding{" "}
          <code>name</code> with a value of <code>undefined</code> still changes the result of the{" "}
          <code>in</code> check and the object's key list.
        </p>

        <h3 class="mt-4">Advanced: array key enumeration</h3>

        <p>
          Array enumeration is structural too. Calls such as <code>Object.keys()</code>,
          <code>Reflect.ownKeys()</code>, and <code>for...in</code> track the array's indexed
          properties, not just its <code>length</code>. Adding or deleting an index therefore
          updates an effect that enumerates the array, even when deleting an index leaves the array
          length unchanged.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $effect, $store } from "vynn";

const items = $store(["first", "second", "third"]);

$effect(() => {
  console.log("Indexes:", Object.keys(items));
  console.log("Own keys:", Reflect.ownKeys(items));
});

// Removes index "1" but does not change items.length.
delete items[1];

// The enumeration effect runs again:
// Indexes: ["0", "2"]
// Own keys: ["0", "2", "length"]
          `}
        />

        <p>
          This is different from reading <code>items.length</code>. The length can stay the same
          after deleting an array slot, but the set of own keys has still changed. Use array
          enumeration when the UI depends on which indexes actually exist, and use
          <code>length</code> when it only depends on the array's size.
        </p>

        <h2 class="mt-6">Using Map and Set</h2>

        <p>
          <code>$store()</code> also supports <code>Map</code>, <code>Set</code>,
          <code>WeakMap</code>, and <code>WeakSet</code>. Collection methods keep their native
          calling conventions while tracking the keys or entries used by reactive computations.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $effect, $store } from "vynn";

const users = $store(new Map<string, { name: string }>());
const selectedIds = $store(new Set<string>());

$effect(() => {
  console.log([...users.values()].map((user) => user.name));
});

users.set("1", { name: "Ada" });
selectedIds.add("1");

users.get("1")!.name = "Grace";
          `}
        />

        <p>
          <code>Map</code> and <code>Set</code> support reactive iteration. <code>WeakMap</code>
          and <code>WeakSet</code> track individual key access and membership, but remain
          non-iterable as required by JavaScript. Built-ins such as <code>Date</code>,
          <code>RegExp</code>, and <code>Promise</code> are left unproxied.
        </p>

        <h2 class="mt-6">When a store contains refs</h2>

        <p>
          A useful convenience: refs placed in ordinary object properties are unwrapped when you read
          them through a store. Writing a non-ref value back to that property updates the original
          writable ref. Arrays and collections are different by design: refs stored there stay
          intact, so you still read them with <code>.value</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $computed, $state, $store } from "vynn";

const count = $state(1);
const double = $computed(() => count.value * 2);

const state = $store({
  count,
  double,
  history: [count],
  values: new Map([["count", count]]),
});

console.log(state.count); // 1
console.log(state.double); // 2
console.log(state.history[0].value); // 1
console.log(state.values.get("count")!.value); // 1

state.count = 2; // Updates count.value
console.log(state.double); // 4
          `}
        />

        <p>
          This follows Vue-style ref unwrapping for object properties without changing how
          standalone <code>$state()</code> and <code>$computed()</code> values are read. Those
          values continue to use <code>.value</code>.
        </p>

        <h2 class="mt-6">Calculating a property with a getter</h2>

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

        <h2 class="mt-6">Load structured data asynchronously</h2>

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

        <h2 class="mt-6">Refresh without replacing the store</h2>

        <p>
          An async store can depend on other reactive values. Dependencies read before the first
          <code>await</code> are tracked. When one changes, Vynn runs the async function again and
          reconciles the new result into the existing store.
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
          An async store must resolve to a plain object. If the request returns a string, number, or
          another non-object value, use async <code>$state()</code> or <code>$computed()</code>
          instead.
        </p>

        <h2 class="mt-6">Sharing a store between components</h2>

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
          The same SSR rule applies here as it does to <code>$state()</code>: module-level stores are
          shared across requests in the same server process. Keep user-specific data inside the
          correct application or request scope.
        </p>

        <h2 class="mt-6">Should I use $state or $store?</h2>

        <p>
          Use <code>$state()</code> when you only need to track a value as a whole, such as a
          number, string, boolean, or a reference that you replace entirely.
        </p>

        <p>
          Use <code>$store()</code> when you need individual properties inside an object or array to
          be independently reactive.
        </p>

        <h2 class="mt-6">API reference</h2>

        <h3>$store(initialObject)</h3>

        <p>
          Creates a deeply reactive proxy from a plain object or array, or a reactive wrapper for
          <code>Map</code>, <code>Set</code>, <code>WeakMap</code>, and <code>WeakSet</code>.
          Property reads, existence checks, and iteration are tracked, and writes notify the
          computations that depend on the affected data.
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
          dependencies read before the first <code>await</code> trigger subsequent refreshes. Each
          resolved snapshot is reconciled into the existing store proxy.
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
