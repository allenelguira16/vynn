import { CodeBlock } from "../components/CodeBlock";

export const MemoPage = () => {
  return (
    <div>
      <h1>memo</h1>
      <section>
        <p>
          <code>memo()</code> is a utility function that memoizes the result of a function call.
          This is useful when you want to ensure a function only runs once and reuses its result on
          every subsequent call.
        </p>

        <h2 class="mt-6">Usage</h2>
        <CodeBlock
          lang="tsx"
          code={`
            import { memo } from "vynn";

            const heavyComputation = memo(() => {
              console.log("Only runs once");
              return Math.random();
            });

            const result1 = heavyComputation();
            const result2 = heavyComputation();

            // result1 === result2
          `}
        />

        <h2 class="mt-6">When to use</h2>
        <ul>
          <li>✅ To cache the result of expensive calculations</li>
          <li>✅ To reuse JSX fragments or DOM structures</li>
          <li>✅ To prevent unnecessary executions inside components</li>
        </ul>

        <p class="mt-6">
          <strong>Note:</strong> <code>memo()</code> does not re-run even if external values change.
          It's intended for static or one-time evaluated results.
        </p>
      </section>
    </div>
  );
};
