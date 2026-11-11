import { CodeBlock } from "../components/CodeBlock";

export const OnMountPage = () => {
  return (
    <div>
      <h1>onMount</h1>

      <p class="text-base-content/70">Run setup after the component exists in the browser, when its DOM is ready to work with.</p>

      <section>
        <p>
          <code>onMount()</code> is the place for setup that should happen after a component is in the
          browser DOM. Use it when you need an element to exist first, or when you're connecting to
          a browser API or third-party library.
        </p>

        <p>You might use it to:</p>

        <ul>
          <li>Attach event listeners.</li>
          <li>Start animations and timers.</li>
          <li>Measure elements or access the DOM.</li>
          <li>Initialize third-party libraries.</li>
          <li>Start requests or other asynchronous tasks.</li>
        </ul>

        <p>
          Unlike code that runs while a component is being created,
          <code>onMount()</code> runs after the component has been mounted. It is client-only, so
          the callback does not run during server-side rendering. Keep browser globals such as
          <code>window</code> and <code>document</code> inside this callback rather than reading
          them at module scope.
        </p>

        <h2 class="mt-6">Run code after mounting</h2>

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

        <h2 class="mt-6">Keep setup and cleanup together</h2>

        <p>
          If your setup creates something that needs to be released, return a cleanup function from
          the same callback. Vynn runs it automatically when the component is destroyed, keeping
          setup and teardown next to each other.
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

        <h2 class="mt-6">Start async work without losing cleanup</h2>

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
          The request starts after mounting. If the component is removed before the request
          finishes, the cleanup function aborts it. This is a useful pattern for work that only
          matters while a particular screen is visible.
        </p>

        <h2 class="mt-6">One important rule about async callbacks</h2>

        <p>
          <code>onMount()</code> does not await a Promise returned by its callback. An asynchronous
          cleanup function is not awaited either. Any cleanup function returned after an{" "}
          <code>await</code> will not be registered by Vynn.
        </p>

        <p>
          Keep the callback synchronous and start asynchronous work inside it when needed. Return
          your cleanup function immediately.
        </p>

        <h2 class="mt-6">API reference</h2>

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
