import { CodeBlock } from "../components/code-block";

export const InstallationPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Get started</p>
    <h1>Installation</h1>
    <p class="lead">
      Vynn works with Vite through its official Vite plugin. The plugin includes the JSX compiler
      and application integration, so you do not need to wire those pieces together yourself.
    </p>

    <h2>1. Install the packages</h2>
    <p>
      Add Vynn to your app, then install Vite, the Vynn plugin, and TypeScript as development
      dependencies.
    </p>
    <CodeBlock
      lang="bash"
      code={`
pnpm add vynn
pnpm add -D vite vite-plugin-vynn typescript@^7

# npm
npm install vynn
npm install -D vite vite-plugin-vynn typescript@^7
      `}
    />
    <h2>2. Configure Vite</h2>
    <p>
      Add <code>vynn()</code> to your Vite plugins. Application handling is enabled by default.
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

    <h2>3. Configure TypeScript</h2>
    <p>Keep JSX intact for Vynn's compiler and point TypeScript at Vynn's JSX types.</p>
    <CodeBlock
      lang="json5"
      code={`
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "vynn",
    "strict": true,
    "noEmit": true
  }
}
      `}
    />
    <p>
      The Vite plugin runs Vynn's JSX transform. Do not add a second JSX transform for the same
      source files.
    </p>
    <p>
      The TypeScript command above keeps the project on the TypeScript 7 release line used by Vynn's
      current workspace. The Vite plugin already includes the JSX compiler, so a separate compiler
      installation is unnecessary for a standard Vite project. For custom build systems, see{" "}
      <a href="/docs/reference/compiler">Compiler and build tooling</a>.
    </p>

    <h2>4. Add your application entry</h2>
    <p>
      Create <code>src/app.tsx</code>. The plugin discovers this conventional entry automatically.
      The <a href="/docs/getting-started/quick-start">quick start</a> walks through a complete
      example.
    </p>

    <h2>Package entry points</h2>
    <p>Most applications only need the package root and the Vite plugin:</p>
    <ul>
      <li>
        <code>vynn</code>: reactive primitives, components, context, lifecycle APIs, and types.
      </li>
      <li>
        <code>vynn/client</code>: browser rendering and hydration helpers.
      </li>
      <li>
        <code>vynn/server</code>: server rendering and server-side request helpers.
      </li>
      <li>
        <code>vynn/server/node</code>: adapters for Node HTTP servers.
      </li>
      <li>
        <code>vynn/server-functions/client</code> and <code>vynn/server-functions/server</code>:
        lower-level server-function runtimes.
      </li>
      <li>
        <code>vynn/jsx-runtime</code>: JSX types used by TypeScript tooling.
      </li>
      <li>
        <code>vynn/render</code>: low-level helpers used by generated compiler output, not normal
        application code.
      </li>
    </ul>
    <p>
      Keep server-only entry points out of browser modules. Continue with the
      <a href="/docs/getting-started/quick-start">quick start</a> to create your first screen.
    </p>
  </article>
);
