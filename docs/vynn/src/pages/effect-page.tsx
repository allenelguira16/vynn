import { CodeBlock } from "../components/CodeBlock";

export const EffectPage = () => (
  <div>
    <h1>$effect</h1>
    <section>
      <p>
        <code>$effect()</code> runs a callback that performs work outside the normal DOM binding
        process. Vynn tracks reactive values read while the callback runs and schedules the effect
        again when those dependencies change.
      </p>

      <h2 class="mt-6">Basic usage</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state } from "vynn";

function Counter() {
  const count = $state(0);

  $effect(() => {
    console.log("Count:", count.value);
  });

  return (
    <button onClick={() => count.value++}>
      Increment
    </button>
  );
}
      `}
      />
      <p>
        The callback runs once immediately, so the initial value is logged. Subsequent invalidations
        are deduplicated and run through Vynn's queued effect phase. The component function itself
        is not called again just because the count changes.
      </p>

      <h2 class="mt-6">Returning cleanup</h2>
      <p>
        Return a function when an effect creates a resource that must be replaced or released. Vynn
        runs the previous cleanup before the effect executes again, and runs the current cleanup
        when the effect is disposed.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state } from "vynn";

const search = $state("");

$effect(() => {
  const query = search.value;
  const controller = new AbortController();

  void fetch("/api/search?q=" + encodeURIComponent(query), {
    signal: controller.signal,
  });

  return () => {
    controller.abort();
  };
});
      `}
      />
      <p>
        This keeps each request tied to the values that started it. When
        <code>search.value</code> changes, the previous request is aborted before the next effect
        run starts.
      </p>

      <h2 class="mt-6">Asynchronous work</h2>
      <p>
        Keep the effect callback synchronous. Vynn does not await a Promise returned by the
        callback, and an async callback cannot provide a cleanup function synchronously after an{" "}
        <code>await</code>. Start asynchronous work inside the effect and return cleanup
        immediately.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state } from "vynn";

const userId = $state("42");

$effect(() => {
  const controller = new AbortController();
  const id = userId.value;

  void loadUser(id, controller.signal).catch((error) => {
    if (!controller.signal.aborted) {
      console.error(error);
    }
  });

  return () => controller.abort();
});
      `}
      />
      <p>
        Dependency collection happens while the callback is executing. Reads made later by{" "}
        <code>loadUser()</code>, after an
        <code>await</code>, or inside an unrelated callback are not automatically tracked by this
        effect.
      </p>

      <h2 class="mt-6">Manual disposal</h2>
      <p>
        <code>$effect()</code> returns a disposer. Effects created while a component owner is active
        are also registered for automatic cleanup when that owner is disposed.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state } from "vynn";

const value = $state(0);

const stop = $effect(() => {
  console.log("Current value:", value.value);
});

// Stop listening before the owning component is disposed.
stop();
      `}
      />

      <h2 class="mt-6">Avoiding dependency collection with untrack</h2>
      <p>
        Sometimes an effect needs to read a value without subscribing to it. Wrap that read in{" "}
        <code>untrack()</code>. Only reactive reads inside the callback passed to{" "}
        <code>untrack</code> are excluded from the current effect's dependency set.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state, untrack } from "vynn";

const activeUserId = $state("42");
const theme = $state("dark");

$effect(() => {
  console.log("Active user:", activeUserId.value);

  // This value is read, but does not trigger this effect.
  console.log("Current theme:", untrack(() => theme.value));
});
      `}
      />

      <h2 class="mt-6">Render-phase effects</h2>
      <p>
        The root package also exports <code>$renderEffect()</code>. It has the same dependency and
        cleanup model, but subsequent executions happen synchronously when the surrounding reactive
        transaction commits. This is a lower-level scheduling primitive for runtime integrations.
        Application side effects should normally use
        <code>$effect()</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $renderEffect } from "vynn";

const stop = $renderEffect(() => {
  // Synchronous render-phase integration work.
});
      `}
      />

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>$effect(callback)</code>
      </h3>
      <p>
        Runs the callback immediately, tracks synchronous reactive reads, and schedules later runs
        when those dependencies change. The callback can return a synchronous cleanup function. The
        function returns a disposer.
      </p>
    </section>
  </div>
);
