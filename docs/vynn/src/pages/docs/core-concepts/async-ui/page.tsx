import { CodeBlock } from "../../../../components/code-block";

const AsyncUiPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Core concepts</p>
    <h1>Async UI</h1>
    <p class="lead">
      Fetching data and loading code should not require a separate state machine for every screen.
      Vynn's reactive primitives can represent async values directly, while <code>Await</code> and
      <code>ErrorBoundary</code> give pending and failed content a clear place in the UI.
    </p>

    <h2>Choose the right async primitive</h2>
    <div class="not-prose my-6 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>API</th>
            <th>Choose it when</th>
            <th>How to read the result</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>$state(async () =&gt; ...)</code>
            </td>
            <td>The result is writable state.</td>
            <td>
              <code>resource.value</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>$computed(async () =&gt; ...)</code>
            </td>
            <td>The result is derived and read-only.</td>
            <td>
              <code>resource.value</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>$store(async () =&gt; ...)</code>
            </td>
            <td>The result is a plain object you want to access by property.</td>
            <td>
              <code>resource.name</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>lazy()</code>
            </td>
            <td>The value is a component loaded from a dynamic import.</td>
            <td>Render the component</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Create async state</h2>
    <p>
      Pass an async function to <code>$state()</code> to create writable async-derived state. Vynn
      starts the first request eagerly. After it resolves, you can read or manually assign the
      result through <code>.value</code>.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $state } from "vynn";\n\ntype User = { id: string; name: string };\n\nfunction UserCard() {\n  const user = $state(async () => {\n    const response = await fetch("/api/me");\n    if (!response.ok) throw new Error("Could not load your profile.");\n    return (await response.json()) as User;\n  });\n\n  return <h2>{user.value.name}</h2>;\n}'
      }
    />

    <h2>Use a store for an async object</h2>
    <p>
      When the response is a plain object and you want to read its properties directly, use
      <code>$store()</code>. The async initializer must resolve to a plain object. The store keeps a
      stable root proxy and reconciles compatible object and array values when a later request
      resolves.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $store } from "vynn";\n\ntype Profile = {\n  name: string;\n  preferences: { theme: string };\n};\n\nfunction ProfileCard() {\n  const profile = $store(async () => {\n    const response = await fetch("/api/me");\n    if (!response.ok) throw new Error("Could not load your profile.");\n    return (await response.json()) as Profile;\n  });\n\n  return (\n    <section>\n      <h2>{profile.name}</h2>\n      <p>Theme: {profile.preferences.theme}</p>\n    </section>\n  );\n}'
      }
    />

    <h2>Show a loading fallback with Await</h2>
    <p>
      Reading an async value before it has resolved can suspend the current render. Wrap the content
      that may suspend in <code>Await</code> and provide a fallback for that initial pending state.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { Await } from "vynn";\n\nfunction ProfilePage() {\n  return (\n    <Await fallback={<p>Loading profile...</p>}>\n      <ProfileCard />\n    </Await>\n  );\n}'
      }
    />
    <p>
      The boundary remembers when its children have rendered successfully. Later async refreshes
      keep the existing content visible instead of replacing the page with the fallback again. This
      is useful for search results, filters, and detail pages that refresh while a user is already
      looking at them.
    </p>

    <h2>What happens during a refresh</h2>
    <p>
      Async resources do not retain their previous resolved value. A read made while a replacement
      request is pending suspends until that request resolves. You can use <code>isPending()</code>
      to inspect the resource status, but it does not make the old value available.
    </p>
    <p>
      An <code>Await</code> boundary behaves differently from the resource: after its children have
      rendered successfully, it keeps that existing DOM in place during later refreshes. The
      fallback is used for the initial load, while the refreshed value becomes available when the
      request completes.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { Await, $state } from "vynn";\n\nfunction WeatherSummary() {\n  const weather = $state(async () => {\n    const response = await fetch("/api/weather");\n    if (!response.ok) throw new Error("Weather is unavailable.");\n    return (await response.json()) as { summary: string };\n  });\n\n  return (\n    <Await fallback={<p>Loading weather...</p>}>\n      <section>\n        <p>{weather.value.summary}</p>\n      </section>\n    </Await>\n  );\n}'
      }
    />
    <p>
      Do not rely on <code>resource.value</code> to return the previous result during a refresh. When
      an application needs cached data to remain readable, model that snapshot explicitly in
      separate state.
    </p>

    <h2>Derive async values from state</h2>
    <p>
      <code>$computed()</code> accepts a getter that returns either a normal value or a Promise.
      When the getter reads reactive dependencies, changes to those dependencies start a new
      computation. Async dependencies must be read before the first <code>await</code>; see
      <a href="/docs/core-concepts/advanced-reactivity">Advanced reactivity</a>.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $computed, $state } from "vynn";\n\nfunction UserName() {\n  const userId = $state("42");\n\n  const user = $computed(async () => {\n    const id = userId.value;\n    const response = await fetch("/api/users/" + id);\n    if (!response.ok) throw new Error("User not found.");\n    return (await response.json()) as { name: string };\n  });\n\n  return <p>{user.value.name}</p>;\n}'
      }
    />

    <h2>Handle errors separately</h2>
    <p>
      <code>Await</code> handles pending reads. <code>ErrorBoundary</code> handles errors thrown
      while its children render. Use both when a section can load asynchronously and may also fail.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { Await, ErrorBoundary } from "vynn";\n\nfunction AccountPage() {\n  return (\n    <ErrorBoundary\n      fallback={(error, reset) => (\n        <section role="alert">\n          <p>{error.message}</p>\n          <button onClick={reset}>Try again</button>\n        </section>\n      )}\n    >\n      <Await fallback={<p>Loading account...</p>}>\n        <ProfileCard />\n      </Await>\n    </ErrorBoundary>\n  );\n}'
      }
    />
    <p>
      Keep the boundaries close to the part of the UI they protect. A page-level boundary is useful
      as a last resort, while a smaller boundary lets the rest of the page remain available when one
      panel fails.
    </p>

    <h2>Load components on demand</h2>
    <p>
      <code>lazy()</code> loads a component through a dynamic import. Pass the export name when the
      module uses a named export. The default export is used when the second argument is omitted.
      The optional third <code>moduleId</code> argument identifies the source module for SSR preload
      tracking in custom build integrations; the Vite plugin normally manages this for you.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { lazy } from "vynn";\n\nconst SettingsPage = lazy(\n  () => import("./SettingsPage"),\n  "SettingsPage",\n);'
      }
    />
    <p>
      Put lazy components inside an <code>Await</code> boundary when the surrounding screen needs an
      explicit loading state. With the Vite plugin, Vynn also records lazy modules for preload
      handling during SSR and hydration.
    </p>

    <h2>What happens during server rendering?</h2>
    <p>
      During streaming SSR, an <code>Await</code> boundary can send its fallback before its pending
      children are ready, then stream the resolved content when it becomes available. The browser
      hydrates the server-rendered document and continues using the same async primitives.
    </p>
  </article>
);


export default AsyncUiPage;
