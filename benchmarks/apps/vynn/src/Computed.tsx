import { $computed, $state } from "vynn";

export default function Computed() {
  const count = $state(0);
  const doubled = $computed(() => count.value * 2);

  return (
    <main>
      <h1>Computed</h1>
      <p>Count: {count.value}</p>
      <p>Double: {doubled.value}</p>
    </main>
  );
}
