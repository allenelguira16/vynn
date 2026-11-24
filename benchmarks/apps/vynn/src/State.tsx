import { $state } from "vynn";

export default function State() {
  const count = $state(0);

  return (
    <main>
      <h1>Counter</h1>
      <p>Count: {count.value}</p>
      <button type="button" onClick={() => count.value++}>
        Increment
      </button>
    </main>
  );
}
