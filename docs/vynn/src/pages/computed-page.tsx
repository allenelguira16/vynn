import { CodeBlock } from "../components/CodeBlock";

export const ComputedPage = () => {
  return (
    <div>
      <h1>$computed</h1>

      <section>
        <p>
          <code>$computed</code> creates a reactive value from other reactive values, such as{" "}
          <code>$state</code> and <code>$store</code>. Whenever a dependency changes, the
          computation runs again and updates its result.
        </p>

        <p>
          Use it when you have a value that depends on other state and want Vynn to keep it up to
          date automatically. Unlike <code>$state</code>, a computed value is read-only.
        </p>

        <h2>Basic usage</h2>

        <p>
          Pass a function to <code>$computed</code>. Vynn tracks the reactive values read inside
          that function, so you don't need to manually subscribe to changes or update the computed
          value yourself.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $computed } from "vynn";

function Counter() {
  const count = $state(0);

  const double = $computed(() => count.value * 2);

  const increment = () => {
    count.value++;
  };

  return (
    <div>
      <p>Count: {count.value}</p>
      <p>Double: {double.value}</p>

      <button onClick={increment}>
        Increment
      </button>
    </div>
  );
}
          `}
        />

        <p>
          Every time <code>count.value</code> changes, <code>double</code> is recalculated. You can
          access the result through <code>.value</code>, just like a state.
        </p>

        <h2>How it works</h2>

        <p>
          By default, <code>$computed</code> evaluates its function immediately when it is created.
          It then tracks the reactive dependencies used during that computation.
        </p>

        <p>
          When one of those dependencies changes, Vynn runs the computation again. The latest result
          is stored and returned whenever you read
          <code>.value</code>.
        </p>

        <p>
          You don't need to manually keep derived values in sync. Just describe how the value should
          be calculated, and let Vynn handle the updates.
        </p>

        <h2>Lazy computation</h2>

        <p>
          By default, computed values are evaluated immediately. You can change this behavior by
          passing <code>lazy: true</code> as the second argument.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $computed } from "vynn";

function App() {
  const count = $state(10);
  const double = $computed(
    () => count.value * 2,
    { lazy: true }
  );

  return <div>{double.value}</div>;
}
          `}
        />

        <p>
          With lazy evaluation, the computation doesn't run when
          <code>$computed</code> is created. It runs the first time you access <code>.value</code>.
        </p>

        <p>
          After that first evaluation, it behaves like a normal computed value and continues
          tracking its dependencies.
        </p>

        <h2>Using $store? You might not need $computed</h2>

        <p>
          When working with <code>$store</code>, you can define getters directly inside the store
          object. This is often simpler when the derived value only belongs to that particular
          store.
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
        Increment
      </button>
    </div>
  );
}
          `}
        />

        <p>
          The getter reads <code>this.count</code> through the reactive store proxy. When the count
          changes, components that read
          <code>state.double</code> are updated automatically.
        </p>

        <p>
          Store getters are evaluated whenever the property is accessed. You don't need a separate{" "}
          <code>$computed</code> for simple calculations that belong to the store.
        </p>

        <p>
          Use <code>$computed</code> when the derived value depends on multiple reactive sources,
          lives outside a store, or needs to be reused independently.
        </p>

        <h2>Async support</h2>

        <p>
          <code>$computed</code> also accepts asynchronous functions. This is useful when a computed
          value depends on an API request or another asynchronous operation.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $computed, Await } from "vynn";

function UserProfile() {
  const userId = $state(1);

  const user = $computed(async () => {
    const response = await fetch(
      \`/api/users/\${userId.value}\`
    );

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return response.json();
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <h2>{user.value.name}</h2>
    </Await>
  );
}
          `}
        />

        <p>
          The asynchronous computation runs when it is created and whenever a reactive dependency
          read before the first <code>await</code> changes. During the initial request, reading
          <code>user.value</code> suspends until the result is ready.
          <code>Await</code> can display a fallback during this time.
        </p>

        <p>
          When a dependency changes after the first successful computation, the previous resolved
          value remains available while the next computation runs. This means the existing content
          can stay visible instead of showing the loading fallback again.
        </p>

        <p>
          Async computed values are also read-only. Use <code>$state</code>
          when you need a writable value, or <code>$store</code> when you need a reactive object.
        </p>
      </section>
    </div>
  );
};
