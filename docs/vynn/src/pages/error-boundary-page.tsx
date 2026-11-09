import { CodeBlock } from "../components/CodeBlock";

export const ErrorBoundaryPage = () => {
  return (
    <div>
      <h1>ErrorBoundary</h1>

      <section>
        <p>
          <code>&lt;ErrorBoundary&gt;</code> catches errors thrown while rendering its descendant
          components or while their reactive effects are running. Instead of letting an error break
          the surrounding UI, it replaces the failed content with a fallback.
        </p>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          Wrap the part of your application that needs error handling with
          <code>&lt;ErrorBoundary&gt;</code>. Provide a <code>fallback</code> function to decide
          what should be displayed when an error occurs.
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
          The counter throws an error once its value exceeds <code>5</code>. When that happens, the
          boundary replaces the counter with the fallback UI.
        </p>

        <h2 class="mt-6">The fallback function</h2>

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
          Calling <code>reset()</code> disposes the failed subtree and renders its children again.
          Components inside that subtree are recreated, so their local state is initialized again.
        </p>

        <h2 class="mt-6">How it works</h2>

        <p>
          When an error is caught, Vynn disposes the failed content and renders the fallback
          instead. The rest of the application outside the boundary can continue running.
        </p>

        <p>
          If you have nested error boundaries, an error is handled by the nearest boundary. An error
          thrown while rendering a fallback is passed to its enclosing boundary, if one exists.
        </p>

        <h2 class="mt-6">What does it catch?</h2>

        <p>
          Error boundaries handle instances of <code>Error</code> thrown during descendant rendering
          and reactive effect execution. They do not catch every possible failure.
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
            Errors thrown directly inside event handlers or unrelated asynchronous callbacks are not
            automatically caught by the boundary.
          </li>
        </ul>

        <h2 class="mt-6">API Reference</h2>

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
