import { Link } from "vynn-router";

import vynnLogo from "../assets/vynn.svg";
import { Playground } from "../components/Playground";

export const HomePage = () => (
  <div class="prose max-w-full min-h-screen flex items-center justify-center px-6 py-16">
    <div class="max-w-6xl w-full flex flex-col gap-10">
      <section class="max-w-3xl">
        <h1 class="text-5xl font-bold leading-tight mb-4 flex items-center gap-3">
          Build reactive interfaces, one small component at a time.
          <img src={vynnLogo} class="w-7 h-7" alt="vynn logo" />
        </h1>

        <p>
          Vynn brings JSX and fine-grained reactivity together. You write familiar components, update the
          values your interface depends on, and Vynn keeps the right parts of the page in sync.
        </p>

        <p>
          You can get started with one reactive value and one button. From there, add structured state,
          computed values, async data, and the pieces you need as your app grows. No need to learn
          every feature on day one.
        </p>

        <div class="flex flex-wrap gap-4">
          <Link href="/docs/getting-started/introduction" class="btn btn-soft">
            Start with the quick guide
          </Link>
          <a href="https://github.com/allenelguira16/vynn" class="btn btn-soft" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </section>

      <section class="w-full">
        <h2 class="text-2xl font-semibold mb-2">Try Vynn in your browser</h2>
        <p class="mb-4">
          Change the example, run it, and interact with the result. The editor uses the same JSX compiler as the Vynn toolchain.
        </p>
        <Playground />
      </section>
    </div>
  </div>
);
