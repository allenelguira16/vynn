import { CodeBlock } from "../components/CodeBlock";

export const EffectPage = () => {
  return (
    <div>
      <h1>$effect</h1>

      <section>
        <p>
          <code>$effect</code> runs a function that depends on reactive values. Whenever one of
          those values changes, Vynn schedules the effect to run again. Dependencies are tracked
          automatically, so you don't need to list them manually.
        </p>

        <p>
          Use effects when you need to perform work outside the normal rendering process, such as
          logging values, synchronizing with browser APIs, or setting up timers and event listeners.
        </p>

        <h2 class="mt-6">Basic usage</h2>

        <p>
          An effect runs immediately when it is created. After that, it runs again whenever a
          reactive value it reads changes.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $effect } from "vynn";
import { renderToDOM } from "vynn/client";

function Counter() {
  const count = $state(0);

  $effect(() => {
    console.log("Count is now:", count.value);
  });

  const handleCount = () => {
    count.value++;
  };

  return (
    <div>
      <div>Count: {count.value}</div>

      <button onClick={handleCount}>
        Add counter
      </button>
    </div>
  );
}

renderToDOM(Counter, "#app");
          `}
        />

        <p>
          The effect logs the initial value when <code>Counter</code> is created. Every time
          <code>count.value</code> changes, Vynn schedules it to run again.
        </p>

        <h2 class="mt-6">Returning a cleanup function</h2>

        <p>
          Some effects create things that need to be cleaned up, such as intervals, event listeners,
          or subscriptions. You can return a function from an effect to handle that cleanup.
        </p>

        <p>
          Vynn calls the cleanup function before running the effect again. It also calls it when the
          effect is disposed, such as when its owning component is removed.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
$effect(() => {
  const currentCount = count.value;

  const id = setInterval(() => {
    console.log("Count when timer started:", currentCount);
  }, 1000);

  return () => {
    clearInterval(id);
  };
});
          `}
        />

        <p>
          Whenever <code>count.value</code> changes, Vynn clears the previous interval before
          creating a new one. This prevents old intervals from continuing to run.
        </p>

        <h2 class="mt-6">Working with asynchronous tasks</h2>

        <p>
          You can start asynchronous work inside an effect, but the effect itself should remain
          synchronous. Vynn does not wait for a returned Promise before running the effect again or
          calling its cleanup function.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
async function logLater(value: number, signal: AbortSignal) {
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!signal.aborted) {
    console.log("Delayed value:", value);
  }
}

$effect(() => {
  const controller = new AbortController();

  // Read the reactive value before starting asynchronous work.
  void logLater(count.value, controller.signal);

  return () => {
    controller.abort();
  };
});
          `}
        />

        <p>
          Here, the effect reads <code>count.value</code> synchronously, so Vynn tracks it as a
          dependency. When the value changes, the previous cleanup aborts the task before the effect
          runs again.
        </p>

        <p>
          Keep in mind that reactive reads made after an <code>await</code> are not tracked by the
          effect. Also, starting an asynchronous task does not automatically cancel it when the
          effect re-runs. Use an <code>AbortController</code> or another cleanup mechanism when the
          task needs to be cancelled.
        </p>

        <h2 class="mt-6">API Reference</h2>

        <h3>$effect(callback)</h3>

        <p>Creates a reactive effect and returns a function that disposes it.</p>

        <CodeBlock
          lang="tsx"
          code={`
$effect(() => {
  // Read reactive values and perform side effects.

  return () => {
    // Optional cleanup.
  };
});
          `}
        />

        <p>
          When created inside a component, the effect is automatically disposed with its owning
          component. You can also call the returned disposer to stop it manually.
        </p>
      </section>
    </div>
  );
};
