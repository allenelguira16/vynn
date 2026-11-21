import { $state } from "vynn";

export default function Event() {
  const count = $state(0);

  return (
    <main>
      <h1>Event</h1>
      <p>Count: {count.value}</p>
      <button type="button" onClick={() => count.value++}>
        Increment
      </button>
    </main>
  );
}
