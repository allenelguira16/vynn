import { CodeBlock } from "../components/CodeBlock";

export const ErrorBoundaryPage = () => {
  return (
    <div>
      <h1>ErrorBoundary</h1>

      <p class="text-base-content/70">Keep one broken part of your interface from taking the whole screen down.</p>

      <section>
        <p>
          <code>&lt;ErrorBoundary&gt;</code> gives a part of your UI a recovery plan. When a descendant
          throws during rendering or while one of its reactive effects runs, the boundary replaces
          that failed subtree with fallback UI. The rest of the application can keep working.
        </p>

        <h2 class="mt-6">Give a risky part of the UI a fallback</h2>

        <p>
          Put a boundary around the part of the screen that can fail independently, then decide what
          users should see in the <code>fallback</code> function. You can show a friendly message,
          offer a retry button, or both.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, ErrorBoundary } from "vynn";
import { renderToDOM } from "vynn/client";

function Counter() {
  const count = $state(0);

  const throwError = () => {
    throw new Error("Something went wrong!");
  };

  return (
    <div>
      <p>Count: {count.value}</p>

      {count.value > 5 && throwError()}

      <button onClick={() => count.value++}>
        Add
      </button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div>
          <p>Something went wrong: {error.message}</p>

          <button onClick={reset}>
            Try Again
          </button>
        </div>
      )}
    >
      <Counter />
    </ErrorBoundary>
  );
}

renderToDOM(App, "#app");
          `}
        />

        <p>
          The example deliberately throws after the counter passes <code>5</code>. Try clicking
          through that point: the counter is replaced by the fallback, while anything outside the
          boundary can keep working. The retry button resets the failed subtree and creates it again.
        </p>

        <h2 class="mt-6">Decide what users should see</h2>

        <p>
          The <code>fallback</code> prop receives two arguments:
        </p>

        <ul>
          <li>
            <code>error</code> is the <code>Error</code> instance that was caught. You can use its{" "}
            <code>message</code> or <code>name</code> to display useful information.
          </li>
          <li>
            <code>reset</code> is a function that attempts to render the boundary's children again.
          </li>
        </ul>

        <CodeBlock
          lang="tsx"
          code={`
<ErrorBoundary
  fallback={(error, reset) => (
    <div>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>

      <button onClick={reset}>
        Try Again
      </button>
    </div>
  )}
>
  <MyComponent />
</ErrorBoundary>
          `}
        />

        <p>
          Calling <code>reset()</code> is a real retry, not just a way to hide the message. Vynn
          disposes the failed subtree and creates it again. Components inside it start with fresh
          local state, so any state that must survive a retry should live outside the boundary.
        </p>

        <h2 class="mt-6">What happens after an error?</h2>

        <p>
          When an error is caught, Vynn disposes the failed content and renders the fallback
          instead. The rest of the application outside the boundary can continue running.
        </p>

        <p>
          If you have nested error boundaries, an error is handled by the nearest boundary. An error
          thrown while rendering a fallback is passed to its enclosing boundary, if one exists.
        </p>

        <h2 class="mt-6">What does it catch, and what doesn't it catch?</h2>

        <p>
          An error boundary is deliberately scoped. It catches errors from descendant rendering and
          reactive effects, but it is not a global handler for every error that happens in your app.
        </p>

        <ul>
          <li>Ordinary rendering errors are caught and displayed through the fallback.</li>
          <li>Errors thrown by reactive effects inside the boundary are also forwarded to it.</li>
          <li>
            <code>NotReadyError</code> is not treated as an application error. Vynn lets{" "}
            <code>&lt;Await&gt;</code> and its SSR async handling deal with pending asynchronous
            work.
          </li>
          <li>
            Errors thrown directly from event handlers or unrelated asynchronous callbacks are not
            automatically caught. Handle those failures where you start the work, or route them
            into your own application error state.
          </li>
        </ul>

        <h2 class="mt-6">API reference</h2>

        <h3>&lt;ErrorBoundary&gt;</h3>

        <p>Creates an error boundary around its descendant components.</p>

        <CodeBlock
          lang="tsx"
          code={`
<ErrorBoundary
  fallback={(error, reset) => {
    return <div>{error.message}</div>;
  }}
>
  <MyComponent />
</ErrorBoundary>
          `}
        />

        <h3>fallback</h3>

        <p>
          An optional function that receives the caught error and a reset function. It must return
          the UI to display when the boundary catches an error.
        </p>

        <h3>reset()</h3>

        <p>
          Renders the boundary's children again after an error. If the same error occurs again, the
          fallback will be displayed again.
        </p>
      </section>
    </div>
  );
};
