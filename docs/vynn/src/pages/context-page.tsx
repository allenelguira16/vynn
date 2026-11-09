import { CodeBlock } from "../components/CodeBlock";

export const ContextPage = () => {
  return (
    <div>
      <h1>Contexts</h1>

      <p>
        Contexts allow you to share values between components without manually passing props through
        every component in the tree. This is useful for sharing application state, configuration,
        user information, and other values across deeply nested components.
      </p>

      <section>
        <h2>Creating a context</h2>

        <p>
          <code>createContext</code> creates a context and returns a tuple containing two functions:
          a <code>Provider</code> component and a <code>useContext</code> function.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { createContext } from "vynn";

const [ThemeProvider, useTheme] = createContext<string>();
          `}
        />

        <p>
          The generic type parameter defines the type of value that the context will hold. In this
          example, the context stores a string.
        </p>

        <p>
          The returned <code>Provider</code> makes a value available to its descendant components,
          while <code>useTheme</code>
          retrieves that value from the nearest matching provider.
        </p>
      </section>

      <section>
        <h2>Providing a context</h2>

        <p>
          To make a context available to other components, wrap them with its corresponding Provider
          and pass the value through the <code>value</code> prop.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { createContext } from "vynn";

const [ThemeProvider, useTheme] = createContext<string>();

export function App() {
  return (
    <ThemeProvider value="dark">
      <Page />
    </ThemeProvider>
  );
}

function Page() {
  return <Content />;
}

function Content() {
  const theme = useTheme();

  return <div>Current theme: {theme}</div>;
}
          `}
        />

        <p>
          Context values are available to components anywhere inside the Provider's descendant tree.
          You don't need to pass the value through intermediate components such as <code>Page</code>
          .
        </p>
      </section>

      <section>
        <h2>Consuming a context</h2>

        <p>
          Use the function returned by <code>createContext</code> to access the context value inside
          a component.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const [NameProvider, useName] = createContext<string>();

function Profile() {
  const name = useName();

  return <h2>Hello, {name}!</h2>;
}
          `}
        />

        <p>
          Calling the context function retrieves the value provided by the nearest matching Provider
          in the component tree.
        </p>

        <p>
          Using a context without wrapping the component in its corresponding Provider throws an
          error. Make sure the Provider exists somewhere above the component consuming it.
        </p>
      </section>

      <section>
        <h2>Using context with reactivity</h2>

        <p>
          Contexts can also share reactive values. Since Vynn passes the original value rather than
          creating a copy, you can provide a <code>$state</code> or <code>$store</code> and access
          its reactive properties from descendant components.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { $store, createContext } from "vynn";

const [UserProvider, useUser] = createContext<{
  name: string;
}>();

export function App() {
  const user = $store({
    name: "Allen",
  });

  return (
    <UserProvider value={user}>
      <Profile />
    </UserProvider>
  );
}

function Profile() {
  const user = useUser();

  return (
    <div>
      <p>Name: {user.name}</p>

      <input
        value={user.name}
        onInput={(event) => {
          user.name = event.currentTarget.value;
        }}
      />
    </div>
  );
}
          `}
        />

        <p>
          When <code>user.name</code> changes, components that read that property update
          automatically through Vynn's reactivity system. You don't need to create additional
          effects or manually synchronize the context.
        </p>
      </section>

      <section>
        <h2>Nested providers</h2>

        <p>
          You can nest multiple Providers created from the same context. A descendant will receive
          the value from its nearest Provider, allowing different parts of the component tree to
          have different context values.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const [ThemeProvider, useTheme] = createContext<string>();

function App() {
  return (
    <ThemeProvider value="light">
      <Page />

      <ThemeProvider value="dark">
        <DarkPage />
      </ThemeProvider>
    </ThemeProvider>
  );
}

function Page() {
  const theme = useTheme();

  return <div>Theme: {theme}</div>;
}

function DarkPage() {
  const theme = useTheme();

  return <div>Theme: {theme}</div>;
}
          `}
        />

        <p>
          <code>Page</code> receives <code>"light"</code>, while
          <code> DarkPage</code> receives <code>"dark"</code>. The nested Provider only affects its
          own descendants.
        </p>
      </section>

      <section>
        <h2>API Reference</h2>

        <h3>createContext&lt;T&gt;()</h3>

        <p>Creates a context with the specified value type.</p>

        <CodeBlock
          lang="tsx"
          code={`
const [Provider, useContext] = createContext<T>();
          `}
        />

        <h3>Provider</h3>

        <p>A component that makes a context value available to its descendants.</p>

        <CodeBlock
          lang="tsx"
          code={`
<Provider value={value}>
  {children}
</Provider>
          `}
        />

        <h3>useContext()</h3>

        <p>
          Retrieves the value associated with the nearest matching Provider. Throws an error when no
          Provider is found.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
const value = useContext();
          `}
        />
      </section>
    </div>
  );
};
