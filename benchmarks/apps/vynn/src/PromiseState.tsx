import { $state } from "vynn";

export default function PromiseState() {
  const result = $state(() => Promise.resolve(42));

  return (
    <main>
      <h1>Promise state</h1>
      <p>Result: {result.value}</p>
    </main>
  );
}
