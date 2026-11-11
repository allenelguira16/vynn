import { CodeBlock } from "../components/CodeBlock";

export const ContextPage = () => {
  return (
    <div>
      <h1>Contexts</h1>

      <p class="text-base-content/70">Share values with the parts of your app that need them, without passing the same prop through every layer.</p>

      <p>
        Sometimes a value is useful far below the component that creates it. Context lets you share
        that value with descendants without threading another prop through every component in
        between. It's a natural fit for themes, application settings, and shared reactive state.
      </p>

      <section>
        <h2>First, create a place for the value</h2>

        <p>
          <code>createContext</code> sets up a context and gives you two things: a <code>Provider</code>
          component for supplying the value, and a <code>useContext</code> function for reading it
          later.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
import { createContext } from "vynn";

const [ThemeProvider, useTheme] = createContext<string>();
          `}
        />

        <p>
          The type parameter describes the value you'll provide. Here, the theme is a string, so
          TypeScript can check both the Provider's <code>value</code> and the value returned by
          <code>useTheme()</code>.
        </p>

        <p>
          The returned <code>Provider</code> makes a value available to its descendant components,
          while <code>useTheme</code>
          retrieves that value from the nearest matching provider.
        </p>
      </section>

      <section>
        <h2>Make the value available to a subtree</h2>

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
          Any descendant can read the value from the nearest matching Provider. Intermediate
          components such as <code>Page</code> don't need to know about it or pass it along.
        </p>
      </section>

      <section>
        <h2>Read the value where you need it</h2>

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
          There is no default value in this example. Calling <code>useName()</code> without a
          matching Provider throws. If you see that error, check that the component is actually
          rendered somewhere beneath <code>NameProvider</code>.
        </p>
      </section>

      <section>
        <h2>Share reactive state, not a stale copy</h2>

        <p>
          Context doesn't clone the value you provide. That's handy for reactivity: pass a
          <code>$state()</code> ref or <code>$store()</code> proxy, and every descendant that receives
          it works with that same reactive value. A plain object, on the other hand, doesn't become
          reactive just because it is placed in context.
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
          automatically. Context shares the reference; <code>$store()</code> provides the
          reactivity. You don't need an extra effect to keep the consumers synchronized.
        </p>
      </section>

      <section>
        <h2>Override a value for just one part of the tree</h2>

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
        <h2>API reference</h2>

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
