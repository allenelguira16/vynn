import { CodeBlock } from "../components/CodeBlock";

export const AwaitPage = () => (
  <div>
    <h1>Await</h1>
    <section>
      <p>
        <code>&lt;Await&gt;</code> is an async boundary for a subtree. It displays a fallback when a
        descendant first reads a pending asynchronous reactive value. When the pending work settles,
        Vynn renders the children.
      </p>
      <p>
        Async resources are created with <code>$state(async () =&gt; ...)</code>,
        <code>$store(async () =&gt; ...)</code>, or
        <code>$computed(() =&gt; Promise)</code>. There is no separate
        <code>$async()</code> primitive in the current core API.
      </p>

      <h2 class="mt-6">Basic usage</h2>
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
        The resource starts when it is created. Reading
        <code>message.value</code> while its first request is pending suspends that part of the
        render. The nearest <code>&lt;Await&gt;</code>
        catches the pending read and displays its fallback.
      </p>

      <h2 class="mt-6">What Await does and does not do</h2>
      <ul>
        <li>It handles pending asynchronous reads from descendants.</li>
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

      <h2 class="mt-6">Refreshing while keeping the current view</h2>
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

      <h2 class="mt-6">Multiple asynchronous dependencies</h2>
      <p>
        A child tree can read more than one async resource. The boundary waits for the pending work
        registered by its descendants before it can display the complete children.
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

      <h2 class="mt-6">Manual loading UI without Await</h2>
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

      <h2 class="mt-6">Error handling</h2>
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

      <h2 class="mt-6">Server rendering behavior</h2>
      <p>
        With synchronous or async SSR, pending work is resolved before the complete HTML result is
        returned. With streaming SSR, Vynn can emit the fallback in the initial stream and send a
        later patch when the children are ready. The server renderer owns this streaming protocol;
        the component API stays the same.
      </p>

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
