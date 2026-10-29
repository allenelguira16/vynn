import { onSettled } from "solid-js";

export default function Test() {
  onSettled(() => {});

  return (
    <div>
      <div>Test me sheet</div>
    </div>
  );
}
