import { Link } from "vynn-router";

import { CodeBlock } from "../components/CodeBlock";

export const ThingsToKnowPage = () => {
  return (
    <div>
      <h1>Things to Know</h1>
      <section>
        <p>
          Before diving deeper into Vynn, it's important to understand some core concepts that
          differentiate it from React or other frameworks you might be familiar with. These insights
          will help you build better, more efficient apps with Vynn's reactivity system.
        </p>

        <h2 class="mt-6">Conditional Rendering</h2>
        <p>In React, you might write something like this to conditionally render a component:</p>
        <CodeBlock
          lang="tsx"
          code={`
            import { state } from "vynn";

            function App() {
              const show = state(true);

              if (!show) return;
              return (
                <div>Hi</div>
              )
            }
          `}
        />
        <p>
          However, this pattern won't work in Vynn. Unlike React, components in Vynn don't rerun
          when state changes. Vynn directly updates the DOM based on reactivity, so any conditional
          rendering must live inside JSX itself.
        </p>
        <p>Here's the correct way to conditionally render in Vynn:</p>
        <CodeBlock
          lang="tsx"
          code={`
            import { state } from "vynn";

            function App() {
              const show = state(true);

              return (
                <>
                  {show && <div>Hi</div>}
                </>
              );
            }
          `}
        />

        <h2 class="mt-6">Rendering Arrays</h2>
        <p>
          If you render arrays using <code>map</code> like in React, any update to the array will
          re-render the entire set of elements:
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            import { state } from "vynn";

            function App() {
              const items = state([1, 2, 3, 4]);

              return (
                <>
                  {items.map((item) => (
                    <SomeComponent key={item} value={item} />
                  ))}
                </>
              );
            }
          `}
        />
        <p>
          While this works, Vynn provides a more efficient alternative with <code>loop</code>,
          designed for optimized list rendering with minimal DOM changes.
        </p>
        <p>
          Learn more in the <Link href="/docs/core-concepts/loop">Loop Documentation</Link>.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            import { state, loop } from "vynn";

            function App() {
              const items = state([1, 2, 3, 4]);

              return (
                <>
                  {loop(items).each((item) => (
                    <SomeComponent key={item} value={item} />
                  ))}
                </>
              );
            }
          `}
        />

        <h2 class="mt-6">Children as Functions</h2>
        <p>
          In Vynn, when you pass children to a component, the children are always passed as
          functions - not static values. This ensures that children can be evaluated precisely when
          the parent decides.
        </p>
        <CodeBlock
          lang="tsx"
          code={`
            function App() {
              return (
                <Component>
                  Hi Mom!
                </Component>
              );
            }

            function Component({ children }: { children: () => JSX.Element }) {
              return <div>{children()}</div>;
            }
          `}
        />
        <p>
          Vynn's rendering is parent-first — meaning the parent renders before its children are
          evaluated. This contrasts with React, which builds the tree bottom-up (children first).
          With this model, parents maintain clearer control over their children's rendering.
        </p>

        <h2 class="mt-6">TLDR: Vynn's Mindset Shift</h2>
        <ul class="list-disc pl-6">
          <li>Components don't rerun — updates apply directly to the DOM.</li>
          <li>Conditional rendering must be written inside JSX expressions.</li>
          <li>
            Use <code>loop</code> for efficient list rendering instead of <code>map</code>.
          </li>
          <li>Children are functions — parents control when they're evaluated.</li>
          <li>Rendering is parent-first, unlike React's child-first approach.</li>
        </ul>

        <p class="mt-4">
          By keeping these principles in mind, you'll write Vynn apps that are not only performant
          but also structurally predictable. Embrace the shift — and your UI will thank you for it.
        </p>
      </section>
    </div>
  );
};
