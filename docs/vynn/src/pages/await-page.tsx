import { CodeBlock } from "../components/CodeBlock";

export const AwaitPage = () => (
  <div>
    <h1>Await</h1>
    <p class="text-base-content/70">Show a helpful placeholder while part of your UI waits for data.</p>
    <section>
      <p>
        <code>&lt;Await&gt;</code> gives an async part of your UI a loading state. When a descendant first
        reads an async reactive value that hasn't finished loading yet, the boundary shows its
        fallback. Once the pending work settles, Vynn can render the children.
      </p>
      <p>
        You can use this boundary when a profile card, dashboard panel, or other part of the page
        needs data before it can show its useful content. The rest of the page can remain visible
        while that section waits.

        Async resources are created with <code>$state(async () =&gt; ...)</code>,
        <code>$store(async () =&gt; ...)</code>, or
        <code>$computed(() =&gt; Promise)</code>. There is no separate
        <code>$async()</code> primitive in the current core API.
      </p>

      <h2 class="mt-6">Show something while data loads</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, Await } from "vynn";

function Message() {
  const message = $state(async () => {
    const response = await fetch("/api/message");
    if (!response.ok) throw new Error("Could not load the message");
    return (await response.json()) as { text: string };
  });

  return (
    <Await fallback={<p>Loading message...</p>}>
      <p>{message.value.text}</p>
    </Await>
  );
}
      `}
      />
      <p>
        The resource starts when it is created, not when <code>&lt;Await&gt;</code> appears. The first
        read of <code>message.value</code> suspends while the request is pending, and the nearest
        boundary catches that pending read and displays the fallback. In other words,
        <code>&lt;Await&gt;</code> handles the loading UI; your resource initializer is still where
        the data is loaded. Think of it as a boundary around the part of the page that needs to
        wait, not as a replacement for <code>fetch()</code>.
      </p>

      <h2 class="mt-6">What Await handles (and what it leaves to you)</h2>
      <ul>
        <li>It handles pending asynchronous reads from descendants. It does not start requests or fetch data by itself.</li>
        <li>
          Its <code>fallback</code> prop is optional.
        </li>
        <li>
          It does not catch rejected operations. Use <code>&lt;ErrorBoundary&gt;</code> for errors.
        </li>
        <li>
          It does not require every async resource to be wrapped. You can use{" "}
          <code>isPending()</code> and render loading UI yourself.
        </li>
        <li>
          On the client, the fallback is for the initial pending display. Once the children have
          rendered successfully, later refreshes keep the existing content visible.
        </li>
      </ul>

      <h2 class="mt-6">Keep the current screen during a refresh</h2>
      <p>
        Async <code>$state</code>, <code>$store</code>, and
        <code>$computed</code> resources retain their last successfully resolved value while a
        replacement computation is pending. This makes refreshes different from the initial load.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, Await, isPending } from "vynn";

type User = { id: number; name: string };

function UserPanel() {
  const userId = $state(1);

  const user = $state(async () => {
    const id = userId.value;
    const response = await fetch("/api/users/" + id);
    if (!response.ok) throw new Error("Could not load user");
    return (await response.json()) as User;
  });

  return (
    <Await fallback={<p>Loading the first user...</p>}>
      <section>
        <h2>{user.value.name}</h2>
        {isPending(user) ? <p>Refreshing...</p> : null}
        <button onClick={() => userId.value++}>Load next user</button>
      </section>
    </Await>
  );
}
      `}
      />
      <p>
        The resource reads <code>userId.value</code> before its first
        <code>await</code>, so that read becomes a dependency. Changing the ID starts a new request.
        The previous user remains readable while the request is running, and{" "}
        <code>isPending(user)</code> exposes the refresh state.
      </p>

      <h2 class="mt-6">Wait for several pieces of data together</h2>
      <p>
        A child tree can read several async resources. The boundary keeps track of pending work from its
        descendants and waits until the required reads are ready before showing the complete
        children.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, Await } from "vynn";

function Dashboard() {
  const user = $state(async () => {
    const response = await fetch("/api/user");
    if (!response.ok) throw new Error("Could not load user");
    return response.json() as Promise<{ name: string }>;
  });

  const posts = $state(async () => {
    const response = await fetch("/api/posts");
    if (!response.ok) throw new Error("Could not load posts");
    return response.json() as Promise<Array<{ id: number; title: string }>>;
  });

  return (
    <Await fallback={<p>Loading dashboard...</p>}>
      <h1>{user.value.name}</h1>
      <ul>{posts.value.map((post) => <li>{post.title}</li>)}</ul>
    </Await>
  );
}
      `}
      />

      <h2 class="mt-6">Prefer to control loading yourself?</h2>
      <p>
        <code>Await</code> is a convenience, not a requirement. When you want to control the loading
        branch directly, check <code>isPending()</code>
        before reading the resource value.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, isPending } from "vynn";

function Status() {
  const status = $state(async () => {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("Could not load status");
    return response.text();
  });

  return (
    <div>
      {isPending(status)
        ? <p>Loading status...</p>
        : <p>Status: {status.value}</p>}
    </div>
  );
}
      `}
      />
      <p>
        Avoid reading <code>status.value</code> during its first pending operation. The conditional
        above only reads the value once it is available. After a successful first load, the old
        value remains readable during refreshes.
      </p>

      <h2 class="mt-6">What happens when a request fails?</h2>
      <p>
        A rejected resource throws its error when read. Pair
        <code>&lt;Await&gt;</code> with <code>&lt;ErrorBoundary&gt;</code>
        when the same subtree needs both a loading fallback and an error fallback.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state, Await, ErrorBoundary } from "vynn";

function UserName() {
  const user = $state(async () => {
    const response = await fetch("/api/user");
    if (!response.ok) throw new Error("Could not load user");
    return response.json() as Promise<{ name: string }>;
  });

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <section>
          <p>{error.message}</p>
          <button onClick={reset}>Try again</button>
        </section>
      )}
    >
      <Await fallback={<p>Loading user...</p>}>
        <h1>{user.value.name}</h1>
      </Await>
    </ErrorBoundary>
  );
}
      `}
      />

      <h2 class="mt-6">How this behaves during server rendering</h2>
      <p>
        With synchronous or async SSR, pending work is resolved before the complete HTML result is
        returned. With streaming SSR, Vynn can emit the fallback in the initial stream and send a
        later patch when the children are ready. The server renderer owns this streaming protocol;
        the component API stays the same.
      </p>

      <h2 class="mt-6">A quick way to choose</h2>
      <ul>
        <li>Use <code>&lt;Await&gt;</code> when a section needs a fallback on its first pending read.</li>
        <li>Use <code>isPending()</code> when you want to keep the current content visible and show your own loading state.</li>
        <li>Use <code>&lt;ErrorBoundary&gt;</code> when you also need a recovery UI for failures.</li>
      </ul>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>&lt;Await fallback?&gt;</code>
      </h3>
      <p>
        Receives an optional <code>fallback</code> JSX element and required
        <code>children</code>. The fallback is used for pending async reads during the initial
        display of the children.
      </p>
    </section>
  </div>
);
