import { Link } from "vynn-router";

import vynnLogo from "../assets/vynn.svg";
import { CodeBlock } from "../components/CodeBlock";

export const HomePage = () => {
  return (
    <div class="prose max-w-full min-h-screen flex items-center justify-center px-6 py-16">
      <div class="max-w-6xl w-full flex flex-col lg:flex-row items-start gap-12">
        <div class="w-full lg:w-1/2">
          <h1 class="text-5xl font-bold leading-tight mb-4 flex items-center gap-3">
            Build interfaces, not overhead.
            <img src={vynnLogo} class="w-7 h-7" alt="vynn logo" />
          </h1>

          <p>
            Vynn is a fast, minimal frontend framework that feels like React—but skips the virtual
            DOM. It gives you direct, reactive access to the DOM with smart updates, built-in
            lifecycle hooks, and JSX that just works.
          </p>

          <p>
            Designed for performance and simplicity, vynn helps you focus on your UI—not the
            framework. Whether you're building a tiny widget or a full application, it scales
            effortlessly with you.
          </p>

          <p>
            No re-renders. No diffing. No reconciliation. Just fast, native DOM updates backed by
            fine-grained reactivity.
          </p>

          <div class="flex gap-4">
            <Link href="/docs/introduction" class="btn btn-soft">
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
              import { createApp } from "vynn";

              function App() {
                return (
                  <div>
                    <h1>Hello, vynn!</h1>
                    <p>Build fast UIs with zero virtual DOM.</p>
                  </div>
                );
              }

              createApp(App).mount("#app");
            `}
          />
        </div>
      </div>
    </div>
  );
};
