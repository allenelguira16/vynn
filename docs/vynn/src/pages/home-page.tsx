import { Link } from "vynn-router";

import vynnLogo from "../assets/vynn.svg";
import { CodeBlock } from "../components/CodeBlock";

export const HomePage = () => (
  <div class="prose max-w-full min-h-screen flex items-center justify-center px-6 py-16">
    <div class="max-w-6xl w-full flex flex-col lg:flex-row items-start gap-12">
      <div class="w-full lg:w-1/2">
        <h1 class="text-5xl font-bold leading-tight mb-4 flex items-center gap-3">
          Build interfaces, not overhead.
          <img src={vynnLogo} class="w-7 h-7" alt="vynn logo" />
        </h1>

        <p>
          Vynn is a minimal TypeScript UI framework built around JSX, fine-grained reactivity, and
          direct DOM updates. It provides component composition and lifecycle ownership without
          requiring a virtual DOM diff on every state update.
        </p>

        <p>
          Use reactive state and derived values to describe the parts of the interface that change.
          Vynn tracks those dependencies and updates the affected DOM bindings.
        </p>

        <div class="flex gap-4">
          <Link href="/docs/getting-started/introduction" class="btn btn-soft">
            Get Started
          </Link>
          <a href="https://github.com/allenelguira16/vynn" class="btn btn-soft" target="_blank">
            GitHub
          </a>
        </div>
      </div>

      <div class="w-full lg:w-1/2">
        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";
import { renderToDOM } from "vynn/client";

function App() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Hello, Vynn! Clicked {count.value} times.
    </button>
  );
}

renderToDOM(App, "#app");
          `}
        />
      </div>
    </div>
  </div>
);
