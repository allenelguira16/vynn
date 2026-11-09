import { CodeBlock } from "../components/CodeBlock";

export const AwaitPage = () => {
  return (
    <div>
      <h1>Await</h1>

      <section>
        <p>
          <code>&lt;Await&gt;</code> displays a fallback while an asynchronous resource is loading
          for the first time. Once the resource resolves, the fallback is replaced with the actual
          content.
        </p>

        <p>
          You can use <code>Await</code> with asynchronous resources created by <code>$state</code>,{" "}
          <code>$store</code>, <code>$computed</code>, and <code>$async</code>. This is useful when
          a component needs data before it can display its content.
        </p>

        <h2>Basic usage</h2>

        <p>
          Pass the loading UI through the <code>fallback</code> prop and put the content that
          depends on your asynchronous resource inside
          <code>&lt;Await&gt;</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await } from "vynn";

function App() {
  const message = $state(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return "Hello, world!";
  });

  return (
    <Await fallback={<p>Loading message...</p>}>
      <h1>{message.value}</h1>
    </Await>
  );
}
          `}
        />

        <p>
          While the asynchronous state is pending, the fallback is displayed. Once it resolves, the
          component displays <code>Hello, world!</code>.
        </p>

        <h2>How it works</h2>

        <p>
          <code>Await</code> handles the initial loading state of its children. Here's what happens:
        </p>

        <ol>
          <li>
            When a child reads a pending asynchronous resource, Vynn registers its pending promise
            with the nearest <code>Await</code>
            boundary.
          </li>
          <li>The fallback is displayed while the initial asynchronous operation is pending.</li>
          <li>Once the operation resolves, the fallback is replaced with the actual children.</li>
          <li>
            On subsequent updates, the existing content remains visible instead of showing the
            fallback again.
          </li>
        </ol>

        <p>
          Unlike React's <code>Suspense</code>, <code>Await</code> does not repeatedly replace its
          children with the fallback every time an asynchronous dependency changes. It is designed
          to handle the initial loading state without unnecessarily hiding already displayed
          content.
        </p>

        <h2>Updating asynchronous resources</h2>

        <p>
          Consider a component that loads a user based on a reactive ID. When the ID changes, the
          asynchronous resource runs again.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await } from "vynn";

function UserProfile() {
  const userId = $state(1);

  const user = $state(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      id: userId.value,
      name: \`User \${userId.value}\`,
    };
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <div>
        <h2>{user.value.name}</h2>
        <p>User ID: {user.value.id}</p>
      </div>
    </Await>
  );
}
          `}
        />

        <p>
          After the initial load, changing <code>userId</code> triggers another request. The
          previously resolved content remains visible while the resource refreshes.
        </p>

        <p>
          This behavior is provided by Vynn's asynchronous derived state, which retains its last
          resolved value while computing a new one.
          <code>Await</code> does not show its fallback again for that subsequent update.
        </p>

        <h2>Loading multiple resources</h2>

        <p>
          When a component depends on multiple requests, you can combine them using{" "}
          <code>Promise.all()</code> inside a single asynchronous resource. This makes sure all the
          required data is ready before displaying the content.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await } from "vynn";

function Dashboard() {
  const dashboard = $state(async () => {
    const [userResponse, postsResponse] = await Promise.all([
      fetch("/api/user"),
      fetch("/api/posts"),
    ]);

    const [user, posts] = await Promise.all([
      userResponse.json(),
      postsResponse.json(),
    ]);

    return { user, posts };
  });

  return (
    <Await fallback={<p>Loading dashboard...</p>}>
      <div>
        <h2>{dashboard.value.user.name}</h2>

        <ul>
          {dashboard.value.posts.map((post) => (
            <li>{post.title}</li>
          ))}
        </ul>
      </div>
    </Await>
  );
}
          `}
        />

        <h2>Handling errors</h2>

        <p>
          <code>Await</code> handles pending asynchronous resources, not rejected promises. When an
          asynchronous operation fails, the error should be handled using <code>ErrorBoundary</code>
          .
        </p>

        <p>
          You can combine both components to provide a loading state and an error fallback for the
          same piece of content.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await, ErrorBoundary } from "vynn";

function App() {
  const user = $state(async () => {
    const response = await fetch("/api/user");

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return response.json();
  });

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div>
          <p>{error.message}</p>
          <button onClick={reset}>Try again</button>
        </div>
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
      </section>
    </div>
  );
};
