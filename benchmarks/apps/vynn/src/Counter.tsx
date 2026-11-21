import { $computed, $state } from "vynn";

export default function Counter() {
  const count = $state(0);
  const doubled = $computed(() => count.value * 2);

  return (
    <main>
      <h1>Counter</h1>
      <p>Count: {count.value}</p>
      <p>Double: {doubled.value}</p>
      <button type="button" onClick={() => count.value++}>
        Increment
      </button>
    </main>
  );
}
