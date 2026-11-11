import { Link } from "vynn-router";

import vynnLogo from "../assets/vynn.svg";
import { CodeBlock } from "../components/code-block";

const HomePage = () => (
  <div class="min-h-screen bg-base-100">
    <header class="navbar mx-auto max-w-7xl px-6 py-5 sm:px-10">
      <Link href="/" class="flex items-center gap-3 text-xl font-semibold">
        <img src={vynnLogo} class="h-8 w-8" alt="Vynn logo" />
        Vynn
      </Link>
      <a
        href="https://github.com/allenelguira16/vynn"
        target="_blank"
        rel="noreferrer"
        class="btn btn-ghost btn-sm ml-auto"
      >
        GitHub
      </a>
    </header>

    <main class="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-2 lg:py-24">
      <section>
        <p class="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          A TypeScript UI framework
        </p>
        <h1 class="mb-6 flex items-center gap-3 text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Build interfaces with less machinery.
          <img src={vynnLogo} class="h-10 w-10 shrink-0" alt="" />
        </h1>
        <p class="mb-8 max-w-xl text-lg leading-8 text-base-content/70">
          Vynn brings JSX components and fine-grained reactivity together. Describe your UI with
          familiar TypeScript, keep state close to the code that uses it, and let Vynn update the
          parts of the DOM that actually changed.
        </p>

        <div class="flex flex-wrap gap-3">
          <Link href="/docs/getting-started/quick-start" class="btn btn-primary">
            Start building
          </Link>
          <Link href="/docs/getting-started/introduction" class="btn btn-outline">
            Explore the concepts
          </Link>
        </div>

        <div class="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-base-content/55">
          <span>TypeScript-first</span>
          <span>JSX components</span>
          <span>Fine-grained updates</span>
        </div>
      </section>

      <section class="min-w-0">
        <div class="mb-3 flex items-center justify-between text-xs text-base-content/55">
          <span>COUNTER.TSX</span>
          <span>Just a component</span>
        </div>
        <CodeBlock
          lang="tsx"
          code={`
import { $state } from "vynn";

export function Counter() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Clicked {count.value} times
    </button>
  );
}
          `}
        />
        <div class="mt-4 rounded-box border border-base-300 bg-base-200/50 p-5">
          <p class="mb-1 font-semibold">A small mental model</p>
          <p class="text-sm leading-6 text-base-content/70">
            State changes. Vynn tracks what reads it. Only the affected bindings need to update.
          </p>
        </div>
      </section>
    </main>
  </div>
);


export default HomePage;
