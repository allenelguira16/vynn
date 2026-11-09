import { CodeBlock } from "../components/CodeBlock";

export const OnDestroyPage = () => {
  return (
    <div>
      <h1>onDestroy</h1>

      <section>
        <p>
          <code>onDestroy()</code> registers a cleanup function that runs when its component is
          destroyed. It's useful for releasing resources and cleaning up anything the component
          started during its lifetime.
        </p>

        <p>Common use cases include:</p>

        <ul>
          <li>Clearing timers and intervals.</li>
          <li>Disconnecting sockets and observers.</li>
          <li>Removing event listeners.</li>
          <li>
            Canceling requests using an <code>AbortController</code>.
          </li>
          <li>Unsubscribing from external services.</li>
        </ul>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          Call <code>onDestroy()</code> inside a component and pass it a function containing your
          cleanup logic.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, onDestroy } from "vynn";

function TemporaryPanel() {
  const id = setInterval(() => {
    console.log("Still running...");
  }, 1000);

  onDestroy(() => {
    clearInterval(id);
    console.log("Panel destroyed");
  });

  return <div>Temporary panel</div>;
}

function App() {
  const visible = $state(true);

  return (
    <div>
      <button onClick={() => (visible.value = !visible.value)}>
        Toggle panel
      </button>

      {visible.value ? <TemporaryPanel /> : null}
    </div>
  );
}
          `}
        />

        <p>
          When <code>visible</code> becomes <code>false</code>, the panel is removed and its
          component is destroyed. Vynn then runs its registered cleanup functions, clearing the
          interval.
        </p>

        <h2 class="mt-6">Using it with onMount</h2>

        <p>
          When cleanup is directly related to something initialized inside
          <code>onMount()</code>, you can return a cleanup function from
          <code>onMount()</code> instead.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { onMount } from "vynn";

function WindowListener() {
  onMount(() => {
    const handleResize = () => {
      console.log("Window resized");
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  return <div>Listening for window events</div>;
}
          `}
        />

        <p>
          Vynn runs the returned cleanup function when the component is destroyed. This keeps setup
          and teardown together without needing a separate <code>onDestroy()</code> call.
        </p>

        <p>
          Use <code>onDestroy()</code> when the cleanup is independent of
          <code>onMount()</code>, or when you prefer to register it separately.
        </p>

        <h2 class="mt-6">Asynchronous cleanup</h2>

        <p>
          <code>onDestroy()</code> does not wait for asynchronous cleanup to finish. If your
          callback returns a Promise, Vynn does not await it before continuing component disposal.
        </p>

        <p>
          You can still start asynchronous work inside the callback, but make sure it doesn't depend
          on Vynn waiting for that work to finish.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
onDestroy(() => {
  void saveSession().catch((error) => {
    console.error("Failed to save session:", error);
  });
});
          `}
        />

        <h2 class="mt-6">When does it run?</h2>

        <p>A component's cleanup functions run when its owner is disposed. This can happen when:</p>

        <ul>
          <li>The component is conditionally removed from the UI.</li>
          <li>A parent component is destroyed, disposing its descendants.</li>
          <li>The application is explicitly disposed.</li>
        </ul>

        <p>
          Child components are disposed before their parent's cleanup functions run. This allows
          nested components to release their resources before the parent finishes its own cleanup.
        </p>

        <h2 class="mt-6">API Reference</h2>

        <h3>onDestroy(callback)</h3>

        <p>
          Registers a synchronous cleanup callback for the current component. It must be called
          while a component owner is active.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
onDestroy(() => {
  // Release resources or perform cleanup.
});
          `}
        />
      </section>
    </div>
  );
};
