import { CodeBlock } from "../components/code-block";

export const CoreRuntimePage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Reference</p>
    <h1>Advanced core APIs</h1>
    <p class="lead">
      Most applications can stay with the reactive primitives, components, context, and lifecycle
      APIs covered in the core concepts. This page documents the lower-level tools exposed by
      <code>vynn</code> for library authors and integrations.
    </p>

    <h2>Choose the right effect phase</h2>
    <p>
      <code>$effect()</code> is the normal application effect. It runs immediately the first time,
      then schedules later runs through Vynn's ordinary effect queue. <code>$renderEffect()</code>
      also runs immediately at creation, but later runs synchronously when the reactive transaction
      commits. That makes it useful for work that must be completed as part of a render update.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $renderEffect, $state } from "vynn";\n\nconst position = $state(0);\n\nconst stop = $renderEffect(() => {\n  // This synchronization runs immediately, then synchronously\n  // when a transaction that changes position commits.\n  updatePosition(position.value);\n});\n\n// Stop the effect when its integration is no longer active.\nstop();'
      }
    />
    <p>
      Both effect APIs track reactive reads, run a previous cleanup before the next execution, may
      return a cleanup function, and return a disposer. Effects created while an owner is active are
      also disposed with that owner. Prefer <code>$effect()</code> for subscriptions and normal side
      effects; use <code>$renderEffect()</code> only when synchronous render-phase ordering is
      required.
    </p>

    <h2>Work with component owners</h2>
    <p>
      An owner is the lifetime scope Vynn associates with a component and its reactive work. Owners
      form a tree: child components and effects created under an owner belong to that scope.
      Disposing an owner disposes its descendants and runs its registered cleanups.
    </p>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>API</th>
            <th>Behavior</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>getOwner()</code>
            </td>
            <td>
              Returns the active owner, or <code>null</code> when no owner is active.
            </td>
          </tr>
          <tr>
            <td>
              <code>createOwner(parent?)</code>
            </td>
            <td>
              Creates an owner. The current owner is used as its parent when the argument is
              omitted; pass <code>null</code> to create a detached root.
            </td>
          </tr>
          <tr>
            <td>
              <code>runWithOwner(owner, callback)</code>
            </td>
            <td>
              Runs a callback with the supplied owner active and restores the previous owner
              afterwards.
            </td>
          </tr>
          <tr>
            <td>
              <code>disposeOwner(owner)</code>
            </td>
            <td>Disposes the owner's descendants and cleanups. Repeated disposal is safe.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      These APIs are useful when a library creates reactive work outside the normal component call
      path. The example below creates an isolated lifetime that can be stopped as one unit:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $effect, createOwner, disposeOwner, runWithOwner } from "vynn";\n\nconst scope = createOwner(null);\n\nrunWithOwner(scope, () => {\n  $effect(() => {\n    const unsubscribe = subscribeToUpdates();\n    return unsubscribe;\n  });\n});\n\n// When the library instance is disposed, release its effects and children.\ndisposeOwner(scope);'
      }
    />
    <p>
      The owner passed to <code>runWithOwner()</code> becomes the active scope only for the
      callback. It does not make the callback reactive by itself; reactive effects and component
      calls create the work that belongs to the scope. Normal application components should let Vynn
      manage their owners automatically.
    </p>

    <h2>Reference types</h2>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Type</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>State&lt;T&gt;</code>
            </td>
            <td>
              Writable ref-like value returned by <code>$state()</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>Async&lt;T&gt;</code>
            </td>
            <td>Ref-like asynchronous value used by Vynn's async state runtime.</td>
          </tr>
          <tr>
            <td>
              <code>Computed&lt;T&gt;</code>
            </td>
            <td>
              Read-only ref-like value returned by <code>$computed()</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>ComputedOptions</code>
            </td>
            <td>
              Options for computed values. Currently exposes <code>lazy</code> to defer the initial
              evaluation until the first read.
            </td>
          </tr>
          <tr>
            <td>
              <code>FC&lt;P&gt;</code>
            </td>
            <td>
              A function component that accepts props of type <code>P</code> and returns{" "}
              <code>JSX.Element</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>PropsWithChildren&lt;P&gt;</code>
            </td>
            <td>
              Adds a required <code>children</code> property to a props type.
            </td>
          </tr>
          <tr>
            <td>
              <code>PropsWithRef&lt;P&gt;</code>
            </td>
            <td>
              Adds a required callback <code>ref</code> that receives an <code>HTMLElement</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>JSX</code>
            </td>
            <td>
              The JSX namespace, including Vynn's element and intrinsic HTML/SVG element types.
            </td>
          </tr>
          <tr>
            <td>
              <code>RenderMode</code>
            </td>
            <td>
              The server render mode union: <code>"sync"</code>, <code>"async"</code>, or{" "}
              <code>"stream"</code>.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The component helpers are type aliases, not wrappers. Use them to describe the shape of a
      component without changing its runtime behavior:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import type { FC, PropsWithChildren, PropsWithRef } from "vynn";\n\ntype PanelProps = PropsWithChildren<{ title: string }>;\n\nconst Panel: FC<PanelProps> = (props) => (\n  <section>\n    <h2>{props.title}</h2>\n    {props.children}\n  </section>\n);\n\ntype TextFieldProps = PropsWithRef<{ label: string }>;\n\nfunction TextField(props: TextFieldProps) {\n  return (\n    <label>\n      {props.label}\n      <input ref={props.ref} />\n    </label>\n  );\n}'
      }
    />
    <p>
      <code>PropsWithChildren</code> makes <code>children</code> required. If a component accepts
      optional children or a different content shape, declare that prop explicitly instead.
      <code>PropsWithRef</code> describes a callback ref for an HTML element; use the specific DOM
      element type in your own props when a component needs a narrower element.
    </p>

    <h2>Read more about the main primitives</h2>
    <ul>
      <li>
        <a href="/docs/core-concepts/reactivity">Reactivity</a> explains state, stores, computed
        values, effects, and untracked reads.
      </li>
      <li>
        <a href="/docs/core-concepts/advanced-reactivity">Advanced reactivity</a> explains
        dependency collection, async refreshes, and store behavior.
      </li>
      <li>
        <a href="/docs/core-concepts/context-and-lifecycle">Context and lifecycle</a> explains
        providers, ownership, mount callbacks, and cleanup.
      </li>
      <li>
        <a href="/docs/core-concepts/async-ui">Async UI</a> explains <code>Await</code>,{" "}
        <code>ErrorBoundary</code>, and pending async values.
      </li>
    </ul>
  </article>
);
