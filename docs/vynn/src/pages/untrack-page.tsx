import { CodeBlock } from "../components/CodeBlock";

export const UntrackPage = () => (
  <div>
    <h1>untrack</h1>
    <section>
      <p>
        Most of the time, you want Vynn to track every reactive value your effect or computed
        getter reads. That is what keeps everything in sync. Occasionally, though, you need a value
        for the current calculation without wanting changes to that value to trigger another run.
        That's when <code>untrack()</code> is useful.
      </p>
      <p>
        Treat it as an escape hatch, not the default. Start with normal dependency tracking and
        reach for <code>untrack()</code> only when you can explain why a particular read should not
        trigger an update.
      </p>

      <h2 class="mt-6">A read you don't want to subscribe to</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state, untrack } from "vynn";

const count = $state(0);
const theme = $state("light");

$effect(() => {
  console.log("Count changed:", count.value);

  // Read the theme without subscribing to it.
  console.log("Current theme:", untrack(() => theme.value));
});
      `}
      />
      <p>
        The effect subscribes to <code>count.value</code>, but it only takes a snapshot of
        <code>theme.value</code> each time it runs. Changing the theme on its own won't rerun the
        effect. The next count update will read the latest theme.
      </p>

      <h2 class="mt-6">Use the same idea in a computed value</h2>
      <p>
        The same rule applies to other reactive computations. A value read inside{" "}
        <code>untrack()</code> does not become a dependency of the surrounding computation.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $state, untrack } from "vynn";

const price = $state(20);
const debugMultiplier = $state(2);

const total = $computed(() => {
  const currentPrice = price.value;
  const multiplier = untrack(() => debugMultiplier.value);

  return currentPrice * multiplier;
});
      `}
      />

      <h2 class="mt-6">Keep the untracked section small</h2>
      <p>
        The callback can contain several reads and ordinary JavaScript statements. None of those
        reactive reads become dependencies of the surrounding computation. Keep it synchronous and
        focused: the smaller the untracked section, the easier it is to see what actually drives an
        update.
      </p>

      <h2 class="mt-6">What untrack does not do</h2>
      <ul>
        <li>It does not freeze or clone the values that are read.</li>
        <li>
          It does not prevent a value from changing. It only changes dependency collection for the
          callback.
        </li>
        <li>It does not defer or debounce a computation.</li>
        <li>
          It does not disable reactivity globally. The previous tracking context is restored
          immediately after the callback returns or throws.
        </li>
      </ul>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>untrack(callback)</code>
      </h3>
      <p>
        Executes a synchronous callback without collecting reactive dependencies and returns the
        callback's result. The active tracking context is restored even if the callback throws.
      </p>
    </section>
  </div>
);
