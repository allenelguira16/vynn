import { CodeBlock } from "../components/CodeBlock";

export const OnMountPage = () => {
  return (
    <div>
      <h1>onMount</h1>

      <section>
        <p>
          <code>onMount()</code> registers a callback that runs after a component has been rendered
          and its DOM is available in the browser. It's useful for code that needs access to browser
          APIs or DOM elements.
        </p>

        <p>Common use cases include:</p>

        <ul>
          <li>Attaching event listeners.</li>
          <li>Starting animations and timers.</li>
          <li>Measuring elements and accessing the DOM.</li>
          <li>Initializing third-party libraries.</li>
          <li>Starting requests or other asynchronous tasks.</li>
        </ul>

        <p>
          Unlike code that runs while a component is being created,
          <code>onMount()</code> runs after the component has been mounted. It is also client-only,
          so its callback is not executed during server-side rendering.
        </p>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          Pass a function to <code>onMount()</code>. Vynn executes it once the component is mounted
          in the browser.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { onMount } from "vynn";
import { renderToDOM } from "vynn/client";

function App() {
  onMount(() => {
    function handleClick(event: MouseEvent) {
      console.log("Clicked!", event);
    }

    window.addEventListener("click", handleClick);
  });

  return (
    <div>
      <h1>Click anywhere</h1>
    </div>
  );
}

renderToDOM(App, "#app");
          `}
        />

        <h2 class="mt-6">Returning a cleanup function</h2>

        <p>
          You can return a function from the <code>onMount()</code> callback to clean up anything
          you initialized. Vynn automatically runs this function when the component is destroyed.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { onMount } from "vynn";

function App() {
  onMount(() => {
    function handleClick(event: MouseEvent) {
      console.log("Clicked!", event);
    }

    window.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("click", handleClick);
    };
  });

  return <h1>Click anywhere</h1>;
}
          `}
        />

        <p>
          When the component is destroyed, the event listener is removed. This keeps setup and
          cleanup together, so you don't have to register a separate <code>onDestroy()</code>{" "}
          callback.
        </p>

        <h2 class="mt-6">Starting asynchronous tasks</h2>

        <p>
          You can start asynchronous work inside <code>onMount()</code>, but keep the mount callback
          itself synchronous. This allows Vynn to register the cleanup function immediately.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { onMount } from "vynn";

function App() {
  onMount(() => {
    const controller = new AbortController();

    const loadData = async () => {
      try {
        const response = await fetch("/api/data", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load data");
        }

        const data = await response.json();
        console.log(data);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
        }
      }
    };

    void loadData();

    return () => {
      controller.abort();
    };
  });

  return <div>Loading data...</div>;
}
          `}
        />

        <p>
          The request starts when the component is mounted. If the component is destroyed before the
          request finishes, the cleanup function aborts it.
        </p>

        <h2 class="mt-6">A note about async callbacks</h2>

        <p>
          <code>onMount()</code> does not await a Promise returned by its callback. An asynchronous
          cleanup function is not awaited either. Any cleanup function returned after an{" "}
          <code>await</code> will not be registered by Vynn.
        </p>

        <p>
          Keep the callback synchronous and start asynchronous work inside it when needed. Return
          your cleanup function immediately.
        </p>

        <h2 class="mt-6">API Reference</h2>

        <h3>onMount(callback)</h3>

        <p>
          Registers a callback to run after the component is mounted in the browser. The callback
          can optionally return a synchronous cleanup function.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
onMount(() => {
  // Setup after mounting.

  return () => {
    // Cleanup when the component is destroyed.
  };
});
          `}
        />
      </section>
    </div>
  );
};
