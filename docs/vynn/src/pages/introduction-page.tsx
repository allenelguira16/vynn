import { CodeBlock } from "../components/CodeBlock";

export const IntroductionPage = () => (
  <div>
    <h1>Vynn</h1>
    <section>
      <strong>Vynn</strong>

      <h2 class="mt-6">A first component</h2>
      <CodeBlock
        lang="tsx"
        code={`
import { $state } from "vynn";

export function Counter() {
  const count = $state(0);

  return (
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  );
}
      `}
      />
    </section>
  </div>
);
