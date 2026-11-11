import { Link } from "vynn-router";

import { CodeBlock } from "../components/CodeBlock";

export const StatePage = () => (
  <div>
    <h1>$state</h1>

    <section>
      <p>
        Need to remember a value and show it in your UI? Start with <code>$state()</code>.
        It creates one reactive value that you can read and update through <code>.value</code>.
        When that value changes, Vynn updates the places that use it.
      </p>
      <p>
        Counters, search terms, form fields, selected tabs, toggles: these are all good examples
        of values that work well with <code>$state()</code>.
      </p>

      <h2 class="mt-6">Create it, read it, update it</h2>
      <p>
        Pass the starting value to <code>$state()</code>. Read the current value with
        <code>.value</code>, then assign to <code>.value</code> when something changes.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state } from "vynn";

function Counter() {
  const count = $state(0);

  return (
    <div>
      <p>You clicked {count.value} times.</p>
      <button onClick={() => count.value++}>
        Add one
      </button>
    </div>
  );
}
        `}
      />
      <p>
        That's all the setup you need. You can use familiar JavaScript operations such as
        <code>++</code>, <code>+=</code>, comparisons, and ordinary assignment. Vynn takes care
        of notifying the UI.
      </p>
      <p>
        <strong>Try it:</strong> change the button so it adds two instead of one. Then add a
        second piece of state for a reset button.
      </p>

      <h2 class="mt-6">Why does the UI update?</h2>
      <p>
        When Vynn evaluates a reactive part of your UI, it remembers the reactive values that
        were read. Later, when one of those values changes, Vynn knows which part needs an update.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const count = $state(0);

return (
  <div>
    <p>Count: {count.value}</p>
    <p>Double: {count.value * 2}</p>
  </div>
);
        `}
      />
      <p>
        Both expressions read <code>count.value</code>, so both stay in sync. The component
        function itself doesn't need to run again for every click.
      </p>

      <h2 class="mt-6">A state value is not the same as a normal variable</h2>
      <p>
        JavaScript calculations still happen when their line of code runs. If you copy a state
        value into a regular variable, that variable is just a snapshot.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const count = $state(1);

const snapshot = count.value * 2;
// snapshot is 2. It won't update when count changes.

const doubled = $computed(() => count.value * 2);
// doubled follows count.
        `}
      />
      <p>
        For a value you want to calculate from other reactive values, use
        <code>$computed()</code>. There's no need to create another state value and keep it
        synchronized by hand.
      </p>

      <h2 class="mt-6">What if I want to store an object?</h2>
      <p>
        <code>$state()</code> tracks the value as a whole. If you replace the object, consumers
        that read the state update. It does not make each nested property independently reactive.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const user = $state({
  name: "Ada",
  settings: {
    theme: "dark",
  },
});

// Replace the state value.
user.value = {
  name: "Grace",
  settings: { theme: "light" },
};
        `}
      />
      <p>
        Need to update <code>user.name</code> or <code>user.settings.theme</code> directly and
        have those individual properties tracked? That's what
        <Link href="/docs/reactivity/store"><code>$store()</code></Link> is for.
      </p>

      <h2 class="mt-6">Async state</h2>
      <p>
        <code>$state()</code> can also start an asynchronous operation. Pass an
        <code>async</code> function to create writable async state. The operation starts
        immediately, and the resource tracks reactive values read before the first
        <code>await</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, Await } from "vynn";

function ThemeLabel() {
  const theme = $state(async () => {
    const response = await fetch("/api/theme");

    if (!response.ok) {
      throw new Error("Could not load the theme");
    }

    return (await response.json()) as string;
  });

  return (
    <Await fallback={<p>Loading theme...</p>}>
      <p>Current theme: {theme.value}</p>
    </Await>
  );
}
        `}
      />
      <p>
        On the first load, there isn't a value to show yet. Reading
        <code>theme.value</code> suspends that part of the UI, and the nearest
        <code>&lt;Await&gt;</code> displays its fallback while the request is pending.
      </p>

      <h3 class="mt-4">Refresh data without hiding what's already there</h3>
      <p>
        An async state can depend on another reactive value. When that value changes,
        Vynn runs the initializer again. After the first successful load, the previous result
        stays available while the next request is running.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, Await, isPending } from "vynn";

function UserProfile() {
  const userId = $state(1);

  const user = $state(async () => {
    // Read the ID before awaiting the request.
    const id = userId.value;
    const response = await fetch("/api/users/" + id);

    if (!response.ok) {
      throw new Error("Could not load this user");
    }

    return (await response.json()) as { name: string };
  });

  return (
    <Await fallback={<p>Loading the first user...</p>}>
      <section>
        <h2>{user.value.name}</h2>
        {isPending(user) ? <p>Loading the next user...</p> : null}
        <button onClick={() => userId.value++}>
          Next user
        </button>
      </section>
    </Await>
  );
}
        `}
      />
      <p>
        The first request uses the <code>&lt;Await&gt;</code> fallback. On later requests, the
        previous user stays on screen and <code>isPending(user)</code> lets you show a smaller
        updating message.
      </p>
      <p>
        Async state is still writable. Assigning to <code>user.value</code> replaces the current
        result and invalidates an older request, so a late response won't overwrite your manual
        update.
      </p>

      <h3 class="mt-4">A note about function values</h3>
      <p>
        A regular function passed to <code>$state()</code> is stored as a value. It isn't called
        as an initializer. Only an <code>async</code> function creates an async state resource.
        This means you can store callbacks without accidentally invoking them.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const onSave = $state(() => {
  console.log("Save clicked");
});

// Invoke the stored callback yourself.
onSave.value();
        `}
      />

      <h2 class="mt-6">Sharing state between components</h2>
      <p>
        You can create a state value in a module and import it into multiple components. Each
        component then uses the same reactive value.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
 // theme.ts
import { $state } from "vynn";

export const theme = $state("light");

// Header.tsx
import { theme } from "./theme";

export function Header() {
  return (
    <button onClick={() => {
      theme.value = theme.value === "light" ? "dark" : "light";
    }}>
      Theme: {theme.value}
    </button>
  );
}
        `}
      />
      <p>
        One server-rendering caution: a module-level state value is shared by requests handled
        by the same server process. That's fine for genuinely shared application data, but keep
        user-specific values such as session details inside the correct app or request scope.
      </p>

      <h2 class="mt-6">API reference</h2>
      <h3><code>$state(initialValue)</code></h3>
      <p>
        Creates a writable reactive value. Read and assign its current value through
        <code>.value</code>.
      </p>
      <h3><code>$state(async initializer)</code></h3>
      <p>
        Creates writable async-derived state. The initializer runs immediately, tracks reactive
        dependencies read before its first <code>await</code>, and retains the last resolved value
        while refreshing.
      </p>
      <h3><code>$state()</code></h3>
      <p>
        Creates a state value whose initial value is <code>undefined</code>. You can supply a
        generic type when you know what will be assigned later.
      </p>
    </section>
  </div>
);
