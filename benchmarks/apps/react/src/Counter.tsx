import { useMemo, useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);

  return (
    <main>
      <h1>Counter</h1>
      <p>Count: {count}</p>
      <p>Double: {doubled}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </main>
  );
}
