import { CodeBlock } from "../components/code-block";

export const QuickStartPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Get started</p>
    <h1>Quick start</h1>
    <p class="lead">
      Let's build a small Vynn app. This setup uses Vite's integrated application mode, so Vynn
      takes care of the browser entry and mounting for you.
    </p>

    <h2>1. Add the Vite scripts</h2>
    <p>
      In your <code>package.json</code>, add a few everyday scripts:
    </p>
    <CodeBlock
      lang="json5"
      code={`
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
      `}
    />

    <h2>2. Configure the plugin</h2>
    <p>
      Your <code>vite.config.ts</code> can stay small. The plugin includes Vynn's JSX compiler and
      discovers the application entry.
    </p>
    <CodeBlock
      lang="tsx"
      code={`
import { defineConfig } from "vite";
import vynn from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynn()],
});
      `}
    />

    <h2>3. Create your app</h2>
    <p>
      Add <code>src/app.tsx</code>. A Vynn app can return the complete HTML document, including the
      document head and body.
    </p>
    <CodeBlock
      lang="tsx"
      code={`
import { $state } from "vynn";

export function App() {
  const count = $state(0);

  return (
    <html lang="en">
      <head>
        <title>My Vynn app</title>
        <meta name="description" content="A small app built with Vynn." />
      </head>
      <body>
        <main>
          <h1>Hello, Vynn</h1>
          <p>You have clicked the button {count.value} times.</p>
          <button onClick={() => count.value++}>
            Add one
          </button>
        </main>
      </body>
    </html>
  );
}
      `}
    />

    <h2>4. Start developing</h2>
    <CodeBlock lang="bash" code="pnpm dev" />
    <p>
      Open the local URL printed by Vite. The button is reactive: changing
      <code>count.value</code> updates the text that reads it.
    </p>

    <div class="not-prose my-8 rounded-box border border-base-300 bg-base-200/50 p-5">
      <p class="mb-2 font-semibold">What just happened?</p>
      <p class="text-sm leading-6 text-base-content/70">
        The Vite plugin found <code>src/app.tsx</code>, transformed its JSX, and served the app. You
        did not need to create a separate DOM mount call or a custom HTML shell.
      </p>
    </div>

    <h2>Next steps</h2>
    <ul>
      <li>
        Explore <a href="/docs/core-concepts/reactivity">reactive state and derived values</a>.
      </li>
      <li>
        Learn how to compose <a href="/docs/core-concepts/components">components</a>.
      </li>
      <li>
        Enable <a href="/docs/guides/rendering">server rendering</a> when your app needs it.
      </li>
    </ul>
  </article>
);
