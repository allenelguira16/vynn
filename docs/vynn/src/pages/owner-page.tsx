import { CodeBlock } from "../components/CodeBlock";

export const OwnerPage = () => (
  <div>
    <h1>Owners and lifecycle scopes</h1>
    <section>
      <p>
        Vynn associates components and reactive work with an <em>owner</em>. An owner forms a
        lifetime scope: child owners, effects, and cleanup callbacks are tied to it. When the owner
        is disposed, its descendants and registered resources are disposed too.
      </p>
      <p>
        Most application code does not need to manage owners directly. Components already receive an
        owner, and APIs such as
        <code>$effect()</code>, <code>onMount()</code>, and
        <code>onDestroy()</code> use it automatically. The owner functions exported from{" "}
        <code>vynn</code> are lower-level tools for integrations and reusable runtime
        infrastructure.
      </p>

      <h2 class="mt-6">Inspect the current owner</h2>
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

      <h2 class="mt-6">Create an explicit owner</h2>
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

      <h2 class="mt-6">Run work under an owner</h2>
      <p>
        <code>runWithOwner(owner, callback)</code> temporarily makes the supplied owner current
        while it invokes the callback. Vynn restores the previous owner after the callback returns
        or throws.
      </p>
      <p>
        This scope is synchronous. If the callback returns a Promise, the owner is restored as soon
        as the callback returns that Promise. Do not expect the owner to remain active automatically
        after an
        <code>await</code>.
      </p>

      <h2 class="mt-6">Nested ownership and disposal</h2>
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

      <h2 class="mt-6">Owner-aware APIs</h2>
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

      <h2 class="mt-6">Which APIs should application code use?</h2>
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
