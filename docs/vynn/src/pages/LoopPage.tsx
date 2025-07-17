import { CodeBlock } from "../components/CodeBlock";

export const LoopPage = () => {
  return (
    <div>
      <h1>loop</h1>
      <section>
        <p>
          <code>loop()</code> is Vynn's fine-grained, keyed list renderer. It lets you iterate over
          an array of items and efficiently render components with preserved internal state.
        </p>
        <p>
          Unlike mapping JSX manually with <code>.map()</code>, <code>loop()</code> tracks each
          component by identity and avoids unnecessary re-renders or DOM moves. This makes it ideal
          for dynamic lists like dropdowns, tabs, sortable items, and more.
        </p>

        <CodeBlock
          lang="tsx"
          code={`
            import { loop, state } from "vynn";

            function App() {
              const numbers = state([1, 2, 3]);

              return (
                <div>
                  {loop(numbers.value).each((number) => (
                    <Dropdown number={number} />
                  ))}
                </div>
              );
            }

            function Dropdown({ number }: { number: number }) {
              const isOpen = state(false);

              return (
                <div>
                  <button onClick={() => (isOpen.value = !isOpen.value)}>
                    Toggle {number}
                  </button>
                  {isOpen.value && (
                    <ul>
                      <li>Item A</li>
                      <li>Item B</li>
                    </ul>
                  )}
                </div>
              );
            }
          `}
        />
        <h2 class="mt-6">
          Why use <code>loop()</code> instead of <code>.map()</code>?
        </h2>
        <ul>
          <li>✅ Preserves component state when items move or update</li>
          <li>✅ Efficient DOM diffing and reordering</li>
          <li>✅ No re-running closures for each render</li>
          <li>
            🚫 <code>.map()</code> in JSX causes unnecessary remounting unless manually memoized
          </li>
        </ul>
        <h2 class="mt-6">Usage</h2>
        <p>
          <code>loop(array).each((item, index) =&gt; JSX)</code> returns a keyed component.
        </p>
        <ul>
          <li>
            <code>item</code> — the current array element
          </li>
          <li>
            <code>index</code> — a reactive <code>state</code> containing the current index
          </li>
        </ul>
        <CodeBlock
          lang="tsx"
          code={`
            <>
              {loop(users.value).each((user, i) => (
                <div>User {i.value + 1}: {user.name}</div>
              ))
            </>}
          `}
        />
        <h2 class="mt-6">Reactivity</h2>
        <p>
          The loop re-runs automatically when the array changes (add, remove, sort, etc.), and uses
          <code>state</code> for the index so you can react to item position.
        </p>
      </section>
    </div>
  );
};
