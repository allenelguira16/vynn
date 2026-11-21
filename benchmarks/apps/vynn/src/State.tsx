import { $state } from "vynn";

export default function State() {
  const count = $state(0);

  return (
    <main>
      <h1>State</h1>
      <p>Count: {count.value}</p>
    </main>
  );
}
