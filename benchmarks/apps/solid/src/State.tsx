import { createSignal } from "solid-js";

export default function State() {
  const [count, setCount] = createSignal(0);

  return (
    <main>
      <h1>Counter</h1>
      <p>Count: {count()}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </main>
  );
}
