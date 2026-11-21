import { $state } from "vynn";

export default function Cell() {
  const count = $state(0);
  (window as unknown as Record<string, unknown>).__vynnBenchmarkState = count.value;

  return (
    <main>
      <h1>Minimal application</h1>
      <p>Same markup across frameworks.</p>
    </main>
  );
}
