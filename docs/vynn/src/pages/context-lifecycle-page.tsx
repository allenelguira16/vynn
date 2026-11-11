import { CodeBlock } from "../components/code-block";

export const ContextLifecyclePage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Core concepts</p>
    <h1>Context and lifecycle</h1>
    <p class="lead">
      Context lets a component provide a value to its descendants without threading a prop through
      every layer. Lifecycle callbacks let components manage work that belongs to their lifetime.
    </p>

    <h2>Create a context</h2>
    <p>
      Call <code>createContext()</code> once to create a provider and a matching consumer function.
      The function returns a tuple, so give the two values clear names when you destructure it.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { createContext } from "vynn";\n\ntype Theme = {\n  mode: "light" | "dark";\n};\n\nexport const [ThemeProvider, useTheme] = createContext<Theme>();'
      }
    />

    <h2>Provide a value to a subtree</h2>
    <p>
      Wrap the part of the component tree that needs the value. Any descendant can call the matching
      consumer function to read the nearest provider's value.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { ThemeProvider } from "./theme-context";\n\nfunction App() {\n  const theme = { mode: "dark" as const };\n\n  return (\n    <ThemeProvider value={theme}>\n      <Header />\n      <MainContent />\n    </ThemeProvider>\n  );\n}'
      }
    />
    <CodeBlock
      lang="tsx"
      code={
        'import { useTheme } from "./theme-context";\n\nfunction Header() {\n  const theme = useTheme();\n\n  return <header data-theme={theme.mode}>Dashboard</header>;\n}'
      }
    />
    <p>
      Context lookup walks from the current component owner toward its parents. If providers for the
      same context are nested, the closest provider wins. Calling the consumer without a matching
      provider throws an error, which makes a missing provider easier to find during development.
    </p>

    <h2>Context does not make a plain object reactive</h2>
    <p>
      Context passes a value through the component tree; it does not turn an ordinary object into
      reactive state. Provide a store or a ref when descendants need to observe updates.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $store, createContext } from "vynn";\n\ntype Preferences = { density: "compact" | "comfortable" };\nconst [PreferencesProvider, usePreferences] = createContext<Preferences>();\n\nfunction App() {\n  const preferences = $store({ density: "comfortable" as "compact" | "comfortable" });\n\n  return (\n    <PreferencesProvider value={preferences}>\n      <SettingsButton />\n    </PreferencesProvider>\n  );\n}\n\nfunction SettingsButton() {\n  const preferences = usePreferences();\n\n  return (\n    <button onClick={() => preferences.density = "compact"}>\n      Density: {preferences.density}\n    </button>\n  );\n}'
      }
    />

    <h2>Understand component ownership</h2>
    <p>
      Vynn associates components and their reactive work with an owner. The owner tree gives
      effects, nested components, context, and cleanup callbacks a lifetime. When a component
      subtree is removed, Vynn can dispose the work created for that subtree instead of leaving
      subscriptions and timers running.
    </p>
    <p>
      This is why lifecycle and context APIs belong inside component creation. Calling
      <code>onMount()</code>, <code>onDestroy()</code>, or a context consumer from unrelated
      module-level code does not have the component owner those APIs need.
    </p>

    <h2>Run browser-only setup with onMount</h2>
    <p>
      <code>onMount()</code> registers a callback to run after the component is mounted in the
      browser. It is a good place to attach DOM listeners, start timers, or connect to browser APIs.
      The callback can return a cleanup function.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $state, onMount } from "vynn";\n\nfunction OnlineStatus() {\n  const online = $state(false);\n\n  onMount(() => {\n    const update = () => {\n      online.value = navigator.onLine;\n    };\n\n    update();\n    window.addEventListener("online", update);\n    window.addEventListener("offline", update);\n\n    return () => {\n      window.removeEventListener("online", update);\n      window.removeEventListener("offline", update);\n    };\n  });\n\n  return <p>{online.value ? "Online" : "Offline"}</p>;\n}'
      }
    />
    <p>
      The initial value is safe to evaluate during server rendering. The browser-only APIs are
      accessed inside <code>onMount()</code>, which does not run on the server.
    </p>

    <h2>Dispose resources with onDestroy</h2>
    <p>
      Use <code>onDestroy()</code> when cleanup should happen as the component owner is disposed.
      This is useful for non-DOM resources and for cleanup that should also happen when server
      rendering finishes.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { onDestroy } from "vynn";\n\nfunction SessionPanel() {\n  const unsubscribe = sessionEvents.subscribe((session) => {\n    console.log(session.status);\n  });\n\n  onDestroy(() => {\n    unsubscribe();\n  });\n\n  return <p>Session updates are active.</p>;\n}'
      }
    />
    <p>
      Prefer the cleanup function returned by <code>onMount()</code> for a resource created only in
      the browser. Use <code>onDestroy()</code> for a lifetime cleanup that is not tied to a browser
      mount callback.
    </p>
  </article>
);
