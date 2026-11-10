import { CodeBlock } from "../components/CodeBlock";

export const ComputedPage = () => (
  <div>
    <h1>$computed</h1>
    <section>
      <p>
        <code>$computed()</code> creates a read-only reactive value derived from other reactive
        values. Vynn tracks the values read by its getter and recalculates the result when those
        dependencies change.
      </p>

      <h2 class="mt-6">Basic usage</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $state } from "vynn";

function Counter() {
  const count = $state(2);
  const doubled = $computed(() => count.value * 2);

  return (
    <button onClick={() => count.value++}>
      {count.value} × 2 = {doubled.value}
    </button>
  );
}
      `}
      />
      <p>
        Read the result through <code>.value</code>. A computed value does not have a setter, so
        update its source values instead of assigning to the computed result.
      </p>

      <h2 class="mt-6">Dependency tracking</h2>
      <p>
        The getter runs immediately by default. Reactive reads made while it runs become
        dependencies. If a later run takes a different branch, Vynn refreshes the dependency set to
        match the reads from that run. Ordinary JavaScript values that are not reactive do not
        trigger recalculation.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $state } from "vynn";

const mode = $state<"net" | "gross">("net");
const net = $state(100);
const tax = $state(12);

const total = $computed(() => {
  return mode.value === "gross"
    ? net.value + tax.value
    : net.value;
});
      `}
      />
      <p>
        The computed value only depends on <code>tax.value</code> while the
        <code>"gross"</code> branch is active. Changing <code>mode</code>
        recalculates the dependencies for the next run.
      </p>

      <h2 class="mt-6">Lazy evaluation</h2>
      <p>
        Pass <code>{`{ lazy: true }`}</code> to defer the first computation until someone reads{" "}
        <code>.value</code>. Once initialized, it continues tracking dependencies and updating like
        an eager computed value.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $state } from "vynn";

const count = $state(10);

const expensive = $computed(
  () => {
    console.log("Calculating...");
    return count.value * 100;
  },
  { lazy: true },
);

// The getter has not run yet.
console.log(expensive.value); // Calculates on first read.
      `}
      />

      <h2 class="mt-6">Asynchronous computed values</h2>
      <p>
        The getter may return a <code>Promise</code>. Unlike async
        <code>$state()</code> and <code>$store()</code> initializers,
        <code>$computed()</code> detects a Promise from the getter's result. It is valid to return a
        Promise from a regular function.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $state, Await, isPending } from "vynn";

function UserProfile() {
  const userId = $state(1);

  const user = $computed(() => {
    const id = userId.value;

    return fetch("/api/users/" + id).then(async (response) => {
      if (!response.ok) throw new Error("Could not load user");
      return response.json() as Promise<{ name: string }>;
    });
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <h2>{user.value.name}</h2>
      {isPending(user) ? <p>Updating...</p> : null}
      <button onClick={() => userId.value++}>Next user</button>
    </Await>
  );
}
      `}
      />
      <p>
        Reads that occur synchronously while the getter is being evaluated are tracked. In the
        example, <code>userId.value</code> is read before the Promise is returned. Reads that happen
        later inside the Promise callback are not part of the getter's synchronous dependency
        collection.
      </p>
      <p>
        The initial read can suspend and be handled by <code>&lt;Await&gt;</code>. After a
        successful result, the previous value remains available while a newer computation is
        pending. Use <code>isPending(user)</code> to show a refresh indicator.
      </p>

      <h2 class="mt-6">Computed values and store getters</h2>
      <p>
        A <code>$store()</code> object can contain a JavaScript getter. That getter is evaluated
        whenever its property is read, and reactive values accessed through <code>this</code> are
        tracked by the current consumer. It is not a separately memoized computed ref.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $store } from "vynn";

const cart = $store({
  unitPrice: 10,
  quantity: 2,

  get subtotal() {
    return this.unitPrice * this.quantity;
  },
});
      `}
      />
      <p>
        Use a store getter for a calculation that naturally belongs to one store. Use{" "}
        <code>$computed()</code> when the derived ref should be reused independently, exposed as a
        read-only reactive value, or derived from multiple sources.
      </p>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>$computed(getter, options?)</code>
      </h3>
      <ul>
        <li>
          <code>getter</code>: returns a value or a Promise.
        </li>
        <li>
          <code>options.lazy</code>: when <code>true</code>, delays the first evaluation until{" "}
          <code>.value</code> is read. Defaults to <code>false</code>.
        </li>
        <li>
          Return value: a read-only object whose current value is read through <code>.value</code>.
        </li>
      </ul>
    </section>
  </div>
);
