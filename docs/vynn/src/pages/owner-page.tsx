import { CodeBlock } from "../components/CodeBlock";

export const OwnerPage = () => (
  <div>
    <h1>Owners and lifecycle scopes</h1>
    <p class="text-base-content/70">An advanced look at how Vynn keeps track of who owns reactive work and when that work should stop.</p>
    <section>
      <p>
        Vynn gives components and reactive work an <em>owner</em>, which is a fancy name for a
        lifetime scope. Effects, child components, and cleanup callbacks belong to that scope.
        When the owner is disposed, everything it owns is cleaned up as well.
      </p>
      <p>
        You normally won't need to create an owner yourself. Vynn gives components an owner
        automatically, and APIs such as <code>$effect()</code>, <code>onMount()</code>, and
        <code>onDestroy()</code> use it for you. The owner helpers are for integrations and
        reusable infrastructure that needs a separate lifetime. If you're building an ordinary
        component, you can safely skip most of this page for now.
      </p>

      <h2 class="mt-6">First, see which owner is active</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { getOwner } from "vynn";

function DebugPanel() {
  const owner = getOwner();

  console.log(owner); // Current owner, or null outside an owner scope.

  return <p>Debug information</p>;
}
      `}
      />
      <p>
        <code>getOwner()</code> returns the owner active for the synchronous execution context. It
        returns <code>null</code> when no owner is active.
      </p>

      <h2 class="mt-6">Create a separate lifetime scope</h2>
      <p>
        <code>createOwner()</code> creates a new owner. By default, it uses the currently active
        owner as its parent. You can also pass an explicit parent owner.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $effect, $state, createOwner, disposeOwner, runWithOwner } from "vynn";

const owner = createOwner();

runWithOwner(owner, () => {
  const count = $state(0);

  $effect(() => {
    console.log("Scoped count:", count.value);
  });
});

// Disposes the effect and any other work registered to this owner.
disposeOwner(owner);
      `}
      />

      <h2 class="mt-6">Run code inside that scope</h2>
      <p>
        <code>runWithOwner(owner, callback)</code> temporarily makes the supplied owner current
        while it invokes the callback. Vynn restores the previous owner after the callback returns
        or throws.
      </p>
      <p>
        This scope only covers the synchronous callback. If it returns a Promise, Vynn restores the
        previous owner as soon as that Promise is returned. An <code>await</code> does not keep the
        owner active. Create owner-bound work before the first <code>await</code>, or explicitly
        re-enter the owner for a later synchronous step.
      </p>

      <h2 class="mt-6">What happens when owners are nested?</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { createOwner, disposeOwner, onDestroy, runWithOwner } from "vynn";

const parent = createOwner();
const child = createOwner(parent);

runWithOwner(child, () => {
  onDestroy(() => {
    console.log("Child cleanup");
  });
});

disposeOwner(parent);
// The child is disposed before the parent's cleanup callbacks.
      `}
      />
      <p>
        Disposing a parent recursively disposes its child owners first. The parent's cleanup
        callbacks then run. This ordering lets nested resources release themselves before the
        surrounding scope finishes.
      </p>
      <p>
        Disposal is idempotent: disposing an owner that has already been disposed does nothing. If
        multiple cleanup callbacks throw, Vynn completes the disposal work and reports the failures
        together.
      </p>

      <h2 class="mt-6">Which APIs use the current owner?</h2>
      <ul>
        <li>
          <code>$effect()</code> registers its disposer with the active owner.
        </li>
        <li>
          <code>onDestroy()</code> adds a cleanup callback to the active owner.
        </li>
        <li>
          <code>onMount()</code> registers a client mount callback for the active owner.
        </li>
        <li>
          <code>createContext()</code> reads and writes values through the owner hierarchy.
        </li>
      </ul>

      <h2 class="mt-6">Do you need to create an owner yourself?</h2>
      <p>
        Prefer component-level lifecycle APIs for normal application features. Use{" "}
        <code>createOwner()</code>, <code>runWithOwner()</code>, and
        <code>disposeOwner()</code> when implementing infrastructure that deliberately creates and
        controls a separate lifetime. Holding onto component owners beyond their intended lifetime
        can keep resources alive longer than expected.
      </p>

      <h2 class="mt-6">API reference</h2>
      <ul>
        <li>
          <code>getOwner()</code> returns the active owner or <code>null</code>.
        </li>
        <li>
          <code>createOwner(parent?)</code> creates a child of the supplied owner, or the current
          owner when omitted.
        </li>
        <li>
          <code>runWithOwner(owner, callback)</code> invokes a callback with the supplied owner
          active for that synchronous call.
        </li>
        <li>
          <code>disposeOwner(owner)</code> disposes the owner, descendants, and registered cleanup
          callbacks.
        </li>
      </ul>
    </section>
  </div>
);
