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

        <p>
          A component invoked without JSX attributes still receives an empty props object. This
          means optional props can be destructured and given defaults without first checking whether
          the entire props argument exists.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
function Greeting({ name = "there" }: { name?: string }) {
  return <p>Hello, {name}!</p>;
}

function App() {
  return <Greeting />;
}
          `}
        />

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

        <p>
          Vynn matches existing list entries using <code>Object.is()</code>. For objects and arrays,
          that means reference identity matters: the same object instance can keep its rendered
          subtree, while a new object with identical fields is treated as a new item. Each old entry
          is reused at most once, including when the input contains duplicate values.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

function TodoList() {
  const todos = $store({
    items: [{ id: 1, title: "Draft" }],
  });

  const replaceTodo = () => {
    const current = todos.items[0];

    // A new object identity creates a new rendered list entry.
    todos.items[0] = { ...current, title: "Updated draft" };
  };

  const updateTodo = () => {
    // Mutating the existing object preserves its identity and list entry.
    todos.items[0].title = "Updated in place";
  };

  return (
    <div>
      {todos.items.map((todo) => <p>{todo.title}</p>)}
      <button onClick={replaceTodo}>Replace item</button>
      <button onClick={updateTodo}>Update existing item</button>
    </div>
  );
}
          `}
        />

        <p>
          This distinction is useful when a list item owns local component state or lifecycle
          resources. Keep the same object instance when you want that rendered entry to survive an
          update. Replacing it with a new instance intentionally creates a fresh entry.
        </p>

        <h2 class="mt-6">5. JSX prop spreads are reconciled reactively</h2>

        <p>
          JSX spread attributes such as <code>&lt;button &#123;...props&#125; /&gt;</code> are not
          copied to the element only once. When the spread expression reads reactive values, Vynn
          tracks those values and reconciles the element whenever they change. For in-place object
          mutations, use a reactive object such as <code>$store()</code>; mutating an ordinary
          JavaScript object by itself does not notify Vynn.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

function SaveButton() {
  type SaveButtonProps = {
    title?: string;
    disabled: boolean;
    onClick: (event: MouseEvent) => void;
  };

  const props = $store<SaveButtonProps>({
    title: "Save changes",
    disabled: false,
    onClick: (event) => console.log("Saved", event.currentTarget),
  });

  return (
    <div>
      <button {...props}>Save</button>

      <button
        onClick={() => {
          props.disabled = !props.disabled;

          if (props.title) {
            delete props.title;
          } else {
            props.title = "Save changes";
          }
        }}
      >
        Toggle spread props
      </button>
    </div>
  );
}
          `}
        />

        <p>
          Properties added to the reactive object are applied, and properties removed from it are
          cleared from the element. The spread is applied through one managed render effect:
          updating an attribute does not create another effect for that property. Replacing an event
          handler updates the existing listener instead of stacking duplicate listeners.
        </p>

        <h3 class="mt-4">Function-valued properties</h3>

        <p>
          An ordinary function-valued spread property is treated as a zero-argument accessor, just
          like a function-valued direct JSX attribute. Vynn calls it to obtain the current attribute
          value. Event properties and <code>ref</code> are exceptions: their functions are treated
          as handlers or ref callbacks, not as accessors.
        </p>

        <h3 class="mt-4">Events inside a spread</h3>

        <p>
          Event properties use the same naming convention as direct JSX attributes. For example,
          <code>onClick</code>, <code>onInput</code>, and <code>onDoubleClick</code> register
          listeners for their corresponding DOM events. Add the <code>Capture</code> suffix to
          listen during the capture phase, such as <code>onClickCapture</code>.
        </p>

        <p>
          The current handler is used when an event fires, even when the handler value changes after
          the element has been created. A missing or non-function event value removes the listener.
          Listeners are also removed when the component that owns the spread is disposed.
        </p>

        <h3 class="mt-4">Refs inside a spread</h3>

        <p>
          A spread can contain a callback ref or an object with a <code>current</code> property.
          Callback refs receive the element when attached and <code>null</code> when the ref is
          replaced, removed, or disposed. Object refs have their <code>current</code> property
          assigned and cleared in the same situations.
        </p>

        <h3 class="mt-4">Style objects</h3>

        <p>
          The <code>style</code> property accepts either a CSS string or an object using
          <code>CSSStyleDeclaration</code>-style property names. Object keys are serialized to CSS
          names, so <code>backgroundColor</code> becomes <code>background-color</code>.
          <code>cssFloat</code> becomes <code>float</code>, vendor-prefixed <code>ms</code>
          properties receive their leading hyphen, and custom properties beginning with
          <code>--</code> keep their names.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store } from "vynn";

type NoticeStyle = Partial<CSSStyleDeclaration> & {
  [name: \`--\${string}\`]: string;
};

function Notice() {
  const style = $store<NoticeStyle>({
    "--notice-accent": "steelblue",
    color: "var(--notice-accent)",
    backgroundColor: "aliceblue",
    borderColor: "steelblue",
    padding: "1rem",
    opacity: "1",
  });

  return (
    <div style={style}>
      This element uses a reactive style object.
    </div>
  );
}
          `}
        />

        <p>
          Style object properties use CSS string values and are serialized as supplied. Vynn does
          not automatically append <code>px</code>, so include units where a property requires them,
          such as <code>padding: "1rem"</code> or <code>width: "240px"</code>. Unitless properties
          such as <code>opacity</code> still use a string value, for example
          <code>"1"</code>. To type custom CSS properties, extend
          <code>Partial&lt;CSSStyleDeclaration&gt;</code> with a template-literal index signature,
          as shown in the example.
        </p>

        <p>
          The special <code>key</code> and <code>children</code> properties are not applied as DOM
          attributes by a spread. Spread refs and event handlers are handled separately from
          ordinary attributes.
        </p>

        <h2 class="mt-6">6. Refs can be assigned directly</h2>

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

        <h2 class="mt-6">7. Event listeners are managed by component ownership</h2>

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

        <h2 class="mt-6">8. Document metadata is handled automatically</h2>

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

        <h2 class="mt-6">9. Raw HTML has its own JSX attribute</h2>

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

        <h2 class="mt-6">10. Async content and Await are optional</h2>

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

        <h2 class="mt-6">11. Client-side fragment navigation scrolls to its target</h2>

        <p>
          When you navigate through <code>Link</code>, <code>navigate()</code>, or
          <code>replace()</code> to a URL containing a fragment, Vynn updates the browser URL and
          then looks for the fragment target. It checks an element's <code>id</code> first and falls
          back to a matching <code>name</code> attribute before calling
          <code>scrollIntoView()</code>.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { Link, navigate } from "vynn-router";

function ArticleNavigation() {
  return (
    <nav>
      <Link href="#examples">Jump to examples</Link>

      <button onClick={() => navigate("/guide#installation")}>
        Open installation section
      </button>
    </nav>
  );
}

function Guide() {
  return (
    <article>
      <h2 id="examples">Examples</h2>
      <h2 id="installation">Installation</h2>
    </article>
  );
}
          `}
        />

        <p>
          This matters because <code>history.pushState()</code> and
          <code>history.replaceState()</code> do not perform the browser's usual fragment scrolling.
          The target must exist in the DOM when the navigation update is applied. Normal external
          links and links that open another browsing context keep their native browser behavior.
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
            <code>key</code> props and matches entries by <code>Object.is()</code> identity.
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
