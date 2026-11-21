import { $state } from "vynn";

function expensiveCalculation(): number {
  let value = 0;

  for (let index = 0; index < 512; index++) {
    value = (value + index) % 97;
  }

  return value;
}

export default function Initializer() {
  const result = $state(() => expensiveCalculation());

  return (
    <main>
      <h1>State initializer</h1>
      <p>Result: {result.value}</p>
    </main>
  );
}
