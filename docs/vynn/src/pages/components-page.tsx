import { CodeBlock } from "../components/code-block";

export const ComponentsPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Core concepts</p>
    <h1>Components</h1>
    <p class="lead">
      A Vynn component is a function that returns JSX. Build small pieces, pass data through props,
      and compose them into a page.
    </p>

    <h2>Write a component</h2>
    <p>
      Components use ordinary TypeScript functions. Define the props your component needs and return
      the markup for its UI. A component can own local reactive state and effects without needing a
      separate class or a special component base type.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'type GreetingProps = {\n  name: string;\n};\n\nexport function Greeting(props: GreetingProps) {\n  return <h1>Hello, {props.name}!</h1>;\n}\n\nexport function App() {\n  return <Greeting name="Ada" />;\n}'
      }
    />

    <h2>Compose components</h2>
    <p>
      Use components inside other components just like native JSX elements. Keep each component
      focused on one part of the interface, then compose those pieces into a page.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        "function PageHeader() {\n  return (\n    <header>\n      <h1>Dashboard</h1>\n      <p>Your latest activity</p>\n    </header>\n  );\n}\n\nfunction Dashboard() {\n  return (\n    <main>\n      <PageHeader />\n      <section>\n        <h2>Overview</h2>\n        <p>Welcome back.</p>\n      </section>\n    </main>\n  );\n}"
      }
    />

    <h2>Pass content with children</h2>
    <p>
      Use <code>PropsWithChildren</code> when a component accepts nested JSX. Vynn exposes this
      helper from the package root so you can keep the children type aligned with its JSX types.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import type { PropsWithChildren } from "vynn";\n\nfunction Panel(props: PropsWithChildren<{ title: string }>) {\n  return (\n    <section class="panel">\n      <h2>{props.title}</h2>\n      <div>{props.children}</div>\n    </section>\n  );\n}\n\nfunction App() {\n  return (\n    <Panel title="Account">\n      <p>Your account details appear here.</p>\n    </Panel>\n  );\n}'
      }
    />
    <p>
      Children are content supplied by the parent. Render <code>props.children</code> wherever that
      content should appear. A wrapper that never renders its children will hide any JSX passed into
      it.
    </p>

    <h2>Use conditional expressions</h2>
    <p>
      Use regular JavaScript expressions in JSX to choose what to display. A ternary is useful when
      both branches have content; <code>&&</code> is useful when the false case should render
      nothing.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        "function AccountStatus(props: { signedIn: boolean }) {\n  return (\n    <section>\n      {props.signedIn ? <Dashboard /> : <SignInPrompt />}\n      {props.signedIn && <p>You are signed in.</p>}\n    </section>\n  );\n}"
      }
    />

    <h2>Render a list</h2>
    <p>
      Use <code>.map()</code> to describe repeated content. The compiler handles the JSX list
      expression so Vynn can preserve matching item subtrees as the list changes.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        "type Todo = { id: number; title: string };\n\nfunction TodoList(props: { todos: Todo[] }) {\n  return (\n    <ul>\n      {props.todos.map((todo) => (\n        <li>{todo.title}</li>\n      ))}\n    </ul>\n  );\n}"
      }
    />
    <p>
      Use stable item identity in the data itself when the list can be reordered or contain repeated
      values. Vynn matches list entries by item identity; it does not require a React-style
      <code>key</code> prop.
    </p>

    <h2>Use typed HTML and SVG elements</h2>
    <p>
      Vynn's JSX types include tag-specific HTML and SVG attributes. Common attributes include
      <code>id</code>, <code>class</code>, <code>style</code>, <code>role</code>, and ARIA
      properties. Form controls also have element-specific props such as <code>value</code>,
      <code>checked</code>, and <code>disabled</code>. A <code>ref</code> can receive the matching
      DOM element through a callback or hold that element directly.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $state } from "vynn";\n\nfunction SearchField() {\n  const query = $state("");\n  let input: HTMLInputElement | undefined;\n\n  return (\n    <label for="query" class="field">\n      <span>Search</span>\n      <input\n        id="query"\n        ref={(element) => { input = element; }}\n        value={query.value}\n        aria-label="Search records"\n        style={{ width: "100%", maxWidth: "32rem" }}\n        onInput={(event) => {\n          query.value = event.currentTarget.value;\n        }}\n        onKeyDownCapture={(event) => {\n          if (event.key === "Escape") query.value = "";\n        }}\n      />\n      <button type="button" onClick={() => input?.focus()}>Focus</button>\n    </label>\n  );\n}'
      }
    />
    <p>
      Event handlers receive the native event with a <code>currentTarget</code> typed to the element
      that owns the handler. Vynn includes common mouse, keyboard, focus, form, input, load/error,
      animation, transition, wheel, and UI events. Add <code>Capture</code> to a supported event
      prop, such as <code>onClickCapture</code> or <code>onKeyDownCapture</code>, to listen in the
      capture phase.
    </p>
    <p>
      The <code>style</code> prop accepts either a CSS string or an object of CSS properties. Vynn
      serializes object keys to CSS names, including custom properties such as
      <code>"--accent"</code>. HTML and SVG attributes are normalized for their respective
      namespaces, so an SVG prop such as <code>strokeWidth</code> becomes the corresponding SVG
      attribute.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'function Icon() {\n  return (\n    <svg viewBox="0 0 24 24" role="img" aria-label="Check">\n      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />\n    </svg>\n  );\n}'
      }
    />

    <h2>Render trusted raw HTML</h2>
    <p>
      The <code>html</code> prop inserts markup as raw HTML instead of escaping it as text. It
      cannot be used on the same element as JSX children. Sanitize any content that can contain user
      input before passing it to this prop; Vynn does not sanitize the string for you.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'function ArticleBody(props: { sanitizedHtml: string }) {\n  return <article class="article-body" html={props.sanitizedHtml} />;\n}'
      }
    />
    <p>
      Prefer normal JSX for application content. Use <code>html</code> only when an integration
      deliberately needs to insert an HTML string that has already been sanitized for its
      destination.
    </p>

    <h2>Understand JSX children</h2>
    <p>
      Vynn's <code>JSX.Element</code> type accepts text, numbers, DOM nodes, arrays of elements, and
      empty values such as <code>false</code>, <code>null</code>, and <code>undefined</code>. This
      lets conditional expressions naturally render nothing when their condition is false. Void HTML
      elements such as <code>input</code> and <code>img</code> do not accept children.
    </p>

    <h2>Register lifecycle work</h2>
    <p>
      A component can register work for the moment it appears in the browser and for the moment its
      owner is disposed. These callbacks belong to the current component, so call them while the
      component is being created.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $state, onDestroy, onMount } from "vynn";\n\nfunction Stopwatch() {\n  const seconds = $state(0);\n  let timer: number | undefined;\n\n  onMount(() => {\n    timer = window.setInterval(() => {\n      seconds.value++;\n    }, 1000);\n  });\n\n  onDestroy(() => {\n    if (timer !== undefined) window.clearInterval(timer);\n  });\n\n  return <p>Elapsed: {seconds.value}s</p>;\n}'
      }
    />
    <p>
      <code>onMount()</code> does not run during server rendering. It may return a cleanup function,
      which is useful for browser listeners and subscriptions. Use
      <code>onDestroy()</code> for cleanup that should run when the component is disposed, including
      resources that are not specific to the browser.
    </p>

    <h2>Handle rendering errors</h2>
    <p>
      Wrap a subtree in <code>ErrorBoundary</code> when it needs a local failure UI. Its fallback
      receives the error and a <code>reset</code> callback that retries rendering the children.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { ErrorBoundary } from "vynn";\n\nfunction App() {\n  return (\n    <ErrorBoundary\n      fallback={(error, reset) => (\n        <section role="alert">\n          <p>{error.message}</p>\n          <button onClick={reset}>Try again</button>\n        </section>\n      )}\n    >\n      <AccountPanel />\n    </ErrorBoundary>\n  );\n}'
      }
    />
    <p>
      Pending async reads are not ordinary rendering errors. Pair an error boundary with
      <code>Await</code> when a subtree can both suspend and fail; see
      <a href="/docs/core-concepts/async-ui">Async UI</a>.
    </p>

    <h2>Render into another DOM node with Portal</h2>
    <p>
      <code>Portal</code> inserts its children into a supplied DOM element after the component
      mounts. It is useful for overlays and dialogs whose DOM needs to live outside the current
      layout. Portals do not render their children during SSR.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { Portal } from "vynn";\n\nfunction DialogLayer(props: { mount: Element }) {\n  return (\n    <Portal mount={props.mount}>\n      <div role="dialog" aria-modal="true">\n        <p>Dialog content</p>\n      </div>\n    </Portal>\n  );\n}'
      }
    />
    <p>
      For values shared by many descendants, use context rather than passing the same prop through
      every intermediate component. Continue to
      <a href="/docs/core-concepts/context-and-lifecycle">Context and lifecycle</a>.
    </p>
  </article>
);
