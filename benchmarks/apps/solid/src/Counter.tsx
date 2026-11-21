import { createMemo, createSignal } from "solid-js";

export default function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);

  return (
    <main>
      <h1>Counter</h1>
      <p>Count: {count()}</p>
      <p>Double: {doubled()}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </main>
  );
}
