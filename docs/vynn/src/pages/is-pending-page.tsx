import { CodeBlock } from "../components/CodeBlock";

export const IsPendingPage = () => {
  return (
    <div>
      <h1>isPending</h1>

      <section>
        <p>
          You have data on screen, but a refresh is still running. Should you replace the whole
          page with a spinner? Usually not. <code>isPending()</code> lets you show a small
          “Updating…” message while keeping the last successful result visible.
        </p>
        <p>
          It works with async <code>$state()</code>, <code>$store()</code>, and
          <code>$computed()</code> values, so you don't need a second state variable just to track
          loading.
        </p>

        <p>
          On the first load, pair it with a conditional so you don't read a value that isn't ready
          yet. After the resource has resolved once, you can keep showing the old result while the
          next request runs.
        </p>

        <h2 class="mt-6">Show an updating message</h2>

        <p>
          Pass the reactive value itself to <code>isPending()</code>, not its <code>.value</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await, isPending } from "vynn";

function UserPanel() {
  const userId = $state(1);

  const user = $state(async () => {
    const id = userId.value;
    const response = await fetch("/api/users/" + id);

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return (await response.json()) as { name: string };
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <div>
        <p>Name: {user.value.name}</p>

        {isPending(user) ? (
          <p>Updating user...</p>
        ) : null}

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
          When the component first loads, <code>&lt;Await&gt;</code> handles the initial pending
          state. Once the user is loaded, changing
          <code>userId.value</code> starts another request.
        </p>

        <p>
          While that request is running, <code>user.value</code> continues to return the previously
          resolved user. Meanwhile,
          <code>isPending(user)</code> returns <code>true</code>, allowing you to display an
          updating indicator without hiding the existing data.
        </p>

        <p>
          When the request finishes, <code>isPending(user)</code> returns
          <code>false</code> and the updated user data becomes available.
        </p>

        <h2 class="mt-6">Use the same check with stores and computed values</h2>

        <p>
          The same function works with asynchronous <code>$store()</code>
          and <code>$computed()</code> values.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $computed, $store, $state, isPending } from "vynn";

const userId = $state(1);

const user = $store(async () => {
  const id = userId.value;
  const response = await fetch("/api/users/" + id);

  if (!response.ok) {
    throw new Error("Failed to load user");
  }

  return await response.json();
});

const userName = $computed(async () => {
  const id = userId.value;
  const response = await fetch("/api/users/" + id + "/name");

  if (!response.ok) {
    throw new Error("Failed to load username");
  }

  return await response.text();
});

console.log(isPending(user));
console.log(isPending(userName));
          `}
        />

        <h2 class="mt-6">Let the UI react to pending changes</h2>

        <p>
          Calling <code>isPending()</code> inside a reactive expression tracks changes to the
          resource's pending status. When an asynchronous operation starts or finishes, dependent UI
          and effects can update automatically.
        </p>

        <p>
          You don't need to create another <code>$state()</code> just to keep track of whether a
          request is loading.
        </p>

        <h2 class="mt-6">API reference</h2>

        <h3>isPending(value)</h3>

        <p>
          Returns <code>true</code> when the supplied asynchronous reactive value is pending, or{" "}
          <code>false</code> when it is not. Values that are not registered asynchronous reactive
          values return
          <code>false</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const pending = isPending(user);
          `}
        />
      </section>
    </div>
  );
};
