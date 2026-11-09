import { CodeBlock } from "../components/CodeBlock";

export const ThingsToKnowPage = () => {
  return (
    <div>
      <h1>Things to Know</h1>

      <section>
        <p>
          Vynn uses JSX, but its rendering model is different from what you might be used to in
          other JSX frameworks. Components are not re-executed whenever reactive values change.
          Instead, Vynn tracks the values used by your UI and updates the affected DOM directly.
        </p>

        <p>
          Understanding these differences will help you avoid common mistakes and get the most out
          of Vynn's compiler and reactivity system.
        </p>

        <h2 class="mt-6">1. Components don't re-run on state updates</h2>

        <p>
          In Vynn, a component function runs when it is created. Changing a reactive value does not
          execute the entire component again. Vynn tracks reactive expressions and updates only the
          parts of the UI that depend on those values.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";

function Counter() {
  console.log("Component executed");

  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}
          `}
        />

        <p>
          Clicking the button updates the displayed count, but
          <code>console.log("Component executed")</code> does not run again. The component has
          already been created.
        </p>

        <p>
          This also means that ordinary JavaScript calculations inside the component are not
          automatically reactive.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, $computed } from "vynn";

function Counter() {
  const count = $state(0);

  // This is calculated only once.
  const snapshot = count.value * 2;

  // This is recalculated when count changes.
  const doubled = $computed(() => count.value * 2);

  return (
    <div>
      <p>Count: {count.value}</p>
      <p>Snapshot: {snapshot}</p>
      <p>Double: {doubled.value}</p>
    </div>
  );
}
          `}
        />

        <p>
          <code>snapshot</code> keeps its initial value because it is an ordinary JavaScript
          variable. <code>doubled</code> stays updated because it is a reactive computed value.
        </p>

        <p>
          When a calculation needs to react to changing values, put the expression directly in JSX
          or use <code>$computed()</code> when you need a reusable derived value.
        </p>

        <h2 class="mt-6">2. Conditional rendering belongs in JSX</h2>

        <p>
          In frameworks that re-execute components, you might use an ordinary JavaScript{" "}
          <code>if</code> statement to decide which content to return.
        </p>

        <p>
          In Vynn, an <code>if</code> statement inside a component runs when the component is
          created. It won't automatically run again when a reactive value changes.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";

function App() {
  const show = $state(true);

  // This condition is evaluated only when App is created.
  if (show.value) {
    return <div>Hi</div>;
  }

  return <div>Hidden</div>;
}
          `}
        />

        <p>
          For reactive conditional rendering, use JSX expressions instead. Vynn's compiler
          recognizes logical and conditional expressions and turns them into managed conditional DOM
          ranges.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";

function App() {
  const show = $state(true);
  const count = $state(0);

  return (
    <div>
      {show.value && <p>Hi!</p>}

      {count.value > 5
        ? <p>That's a lot.</p>
        : <p>Keep counting.</p>}

      <button onClick={() => (show.value = !show.value)}>
        Toggle message
      </button>

      <button onClick={() => count.value++}>
        Add counter
      </button>
    </div>
  );
}
          `}
        />

        <p>
          Both <code>&&</code> and ternary expressions are reactive. Vynn takes care of switching
          between the corresponding DOM branches when their conditions change.
        </p>

        <p>
          Be careful when using <code>&&</code> with numbers. JavaScript returns the original
          left-hand value when the condition is falsy, so{" "}
          <code>items.length && &lt;List /&gt;</code> can render <code>0</code> when the array is
          empty. Prefer an explicit boolean condition such as
          <code>items.length &gt; 0</code>.
        </p>

        <p>
          One more detail: Vynn can keep an inactive conditional branch parked in a detached DOM
          fragment so it can be reused when shown again. Hiding a branch does not necessarily
          destroy its components or immediately run their <code>onDestroy()</code>
          callbacks. Destroying the owning component disposes its descendants.
        </p>

        <h2 class="mt-6">3. JSX in normal variables must be wrapped in a function</h2>

        <p>
          Unlike some JSX frameworks, Vynn does not allow eagerly creating JSX directly inside an
          ordinary variable initializer. The compiler reports an error when it encounters this
          pattern.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
function App() {
  const name = <h1>Your Name</h1>;

  return <div>Hi {name}</div>;
}
          `}
        />

        <p>
          This restriction exists to preserve the order in which Vynn creates and resolves JSX
          nodes. That order is important for server-side rendering and hydration, where
          client-rendered nodes need to match the corresponding server-rendered DOM.
        </p>

        <p>
          Instead, wrap the JSX in a function. This defers its creation until Vynn resolves it in
          its intended position.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
function App() {
  const name = () => <h1>Your Name</h1>;

  return <div>Hi {name}</div>;
}
          `}
        />

        <p>
          This also works when the function contains reactive expressions. Its output can be updated
          through Vynn's normal reactive rendering mechanism.
        </p>

        <h2 class="mt-6">4. You don't need key props in JSX lists</h2>

        <p>
          In Vynn, rendering an array of JSX elements with
          <code>.map()</code> is handled by the compiler. JSX-producing
          <code>.map()</code> expressions are lowered into Vynn's list reconciliation mechanism.
        </p>

        <p>
          You don't need to provide React-style <code>key</code> props. Vynn manages matching and
          reusing list entries internally.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

function TodoList() {
  const todos = $store({
    items: [
      { id: 1, title: "Learn Vynn" },
      { id: 2, title: "Build something" },
      { id: 3, title: "Ship it" },
    ],
  });

  return (
    <div>
      <ul>
        {todos.items.map((todo, index) => (
          <li>
            {index + 1}. {todo.title}
          </li>
        ))}
      </ul>

      <button
        onClick={() => {
          todos.items.push({
            id: 4,
            title: "Write documentation",
          });
        }}
      >
        Add todo
      </button>
    </div>
  );
}
          `}
        />

        <p>
          Vynn's list reconciler reuses matching entries instead of rebuilding the entire list
          whenever the collection changes. Existing rendered items can keep their DOM and component
          state when they are reused.
        </p>

        <p>
          The second callback argument, <code>index</code>, is also reactive. When an item moves to
          a different position, its index is updated without requiring its component to be
          recreated.
        </p>

        <h2 class="mt-6">5. Refs can be assigned directly</h2>

        <p>
          Vynn supports the <code>ref</code> JSX attribute for accessing the underlying DOM element.
          You can provide a variable or a callback.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { onMount } from "vynn";

function SearchInput() {
  let input!: HTMLInputElement;

  onMount(() => {
    input.focus();
  });

  return (
    <input
      ref={input}
      type="text"
      placeholder="Search..."
    />
  );
}
          `}
        />

        <p>
          When the element is created, Vynn assigns it to the variable. This makes it available
          inside lifecycle callbacks such as
          <code>onMount()</code>.
        </p>

        <p>You can also use a callback when you prefer to handle the element directly.</p>

        <CodeBlock
          lang="tsx"
          code={`
function SearchInput() {
  return (
    <input
      ref={(element) => {
        console.log("Input element:", element);
      }}
    />
  );
}
          `}
        />

        <h2 class="mt-6">6. Event listeners are managed by component ownership</h2>

        <p>
          JSX event handlers such as <code>onClick</code> and
          <code>onInput</code> register native DOM event listeners. Vynn associates those listeners
          with the component that created them.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
function App() {
  const handleClick = (event: MouseEvent) => {
    console.log("Clicked:", event.currentTarget);
  };

  return (
    <button onClick={handleClick}>
      Click me
    </button>
  );
}
          `}
        />

        <p>
          When the component is destroyed, Vynn automatically removes its registered event
          listeners. You don't need to manually remove JSX event handlers in{" "}
          <code>onDestroy()</code>.
        </p>

        <p>
          Vynn also supports capture-phase event handlers using attributes such as{" "}
          <code>onClickCapture</code>.
        </p>

        <h2 class="mt-6">7. Document metadata is handled automatically</h2>

        <p>
          Vynn automatically moves native JSX <code>&lt;title&gt;</code>,<code>&lt;meta&gt;</code>,
          and <code>&lt;link&gt;</code>
          elements into the document's <code>&lt;head&gt;</code>. You can declare them inside nested
          components instead of manually managing the document head.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
function BlogPost(props: {
  title: string;
  description: string;
}) {
  return (
    <article>
      <title>{props.title}</title>

      <meta
        name="description"
        content={props.description}
      />

      <h1>{props.title}</h1>
      <p>{props.description}</p>
    </article>
  );
}
          `}
        />

        <p>
          These elements are associated with the component that declares them. When that component
          is destroyed, its metadata is removed. If another component previously registered metadata
          with the same identity, that previous entry can become active again.
        </p>

        <p>
          Their reactive attributes and title content also update normally. This is useful for page
          titles, descriptions, canonical URLs, and other document metadata.
        </p>

        <h2 class="mt-6">8. Raw HTML has its own JSX attribute</h2>

        <p>
          Vynn supports an <code>html</code> attribute for inserting an HTML string directly into an
          element. This is useful when displaying HTML generated by a trusted source or a content
          renderer.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
function Article(props: { content: string }) {
  return (
    <article html={props.content} />
  );
}
          `}
        />

        <p>
          An element cannot use the <code>html</code> attribute and ordinary JSX children at the
          same time.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
 // Invalid: html and JSX children cannot be combined.
function Article(props: { content: string }) {
  return (
    <article html={props.content}>
      <h1>Article</h1>
    </article>
  );
}
          `}
        />

        <p>
          The HTML string is inserted as raw markup, so Vynn does not sanitize it for you. Never
          pass untrusted user content directly to this attribute. Sanitize external HTML before
          rendering it.
        </p>

        <h2 class="mt-6">9. Async content and Await are optional</h2>

        <p>
          Vynn supports asynchronous reactive values through <code>$state()</code>,
          <code>$store()</code>, and <code>$computed()</code>. When an async value is initially
          pending, reading its value suspends until the operation finishes.
        </p>

        <p>
          You can use <code>&lt;Await&gt;</code> to handle this automatically, but it isn't
          required. You can also manage loading states yourself using <code>isPending()</code>.
        </p>

        <h3 class="mt-4">Using isPending without Await</h3>

        <p>
          When you don't need an async boundary, check <code>isPending()</code>
          before reading the resource. This lets you decide what to display while the request is
          running.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, isPending } from "vynn";

function UserProfile() {
  const user = $state(async () => {
    const response = await fetch("/api/user");

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return await response.json() as {
      name: string;
    };
  });

  return (
    <div>
      {isPending(user)
        ? <p>Loading user...</p>
        : <p>Hello, {user.value.name}!</p>
      }
    </div>
  );
}
  `}
        />

        <p>
          <code>isPending()</code> is reactive, so the UI updates when the request starts or
          finishes. Notice that <code>user.value</code> is only accessed when the resource is no
          longer pending. This avoids reading a value that hasn't been resolved yet.
        </p>

        <h3 class="mt-4">Using Await</h3>

        <p>
          When you prefer to let Vynn handle suspended reads, wrap the relevant content in{" "}
          <code>&lt;Await&gt;</code>. It displays a fallback while the initial content is loading.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $state, Await, isPending } from "vynn";

function UserProfile() {
  const user = $state(async () => {
    const response = await fetch("/api/user");

    if (!response.ok) {
      throw new Error("Failed to load user");
    }

    return await response.json() as {
      name: string;
    };
  });

  return (
    <Await fallback={<p>Loading user...</p>}>
      <div>
        <p>Hello, {user.value.name}!</p>

        {isPending(user) ? <p>Refreshing...</p> : null}
      </div>
    </Await>
  );
}
  `}
        />

        <p>
          With <code>&lt;Await&gt;</code>, you don't need to manually check whether the initial
          value is available. Vynn handles the pending read and displays the fallback. Once the
          children have rendered, subsequent async operations keep the existing content visible.
        </p>

        <p>
          Both approaches are valid. Use <code>isPending()</code> when you want direct control over
          loading UI, or <code>&lt;Await&gt;</code>
          when you want a boundary to handle suspended content for you.
        </p>

        <h2 class="mt-6">TL;DR: Vynn's mindset</h2>

        <ul class="list-disc pl-6">
          <li>Components run when they are created, not whenever state changes.</li>
          <li>
            Put reactive calculations in JSX expressions or use
            <code>$computed()</code>.
          </li>
          <li>Use JSX expressions for reactive conditional rendering.</li>
          <li>Wrap JSX assigned to variables in functions to preserve hydration order.</li>
          <li>
            Use <code>.map()</code> for JSX lists. Vynn handles reconciliation without requiring{" "}
            <code>key</code> props.
          </li>
          <li>Inactive conditional branches can be preserved and reused.</li>
          <li>
            Use <code>ref</code> to access DOM elements.
          </li>
          <li>Event listeners are automatically cleaned up with their owning components.</li>
          <li>Native document metadata is automatically managed.</li>
          <li>
            Use <code>&lt;Await&gt;</code> for initial asynchronous loading states.
          </li>
        </ul>

        <p class="mt-4">
          Vynn gives you ordinary JavaScript and JSX, but the way you structure reactive UI is
          different. Once you understand how the compiler manages dynamic expressions, lists,
          branches, and component ownership, the programming model becomes much more predictable.
        </p>
      </section>
    </div>
  );
};
