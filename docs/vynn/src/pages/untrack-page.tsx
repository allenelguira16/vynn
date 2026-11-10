import { CodeBlock } from "../components/CodeBlock";

export const UntrackPage = () => (
  <div>
    <h1>untrack</h1>
    <section>
      <p>
        <code>untrack()</code> runs a callback without collecting reactive dependencies. It is
        useful when a reactive computation needs to read a value for the current execution but
        should not rerun when that particular value changes.
      </p>

      <h2 class="mt-6">Basic usage</h2>
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
        This effect subscribes to <code>count.value</code>, but not
        <code>theme.value</code>. Changing the theme alone does not schedule the effect. When the
        count changes for another reason, the next run reads the latest theme value.
      </p>

      <h2 class="mt-6">Using it in a computed getter</h2>
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

      <h2 class="mt-6">Untrack a larger section</h2>
      <p>
        The callback can contain multiple reads and ordinary JavaScript work. Every reactive read
        during that callback is excluded from the active dependency collection. Keep the callback
        synchronous and as small as practical so it remains clear which values drive the
        computation.
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
