import { onSettled } from "solid-js";

export default function Test2() {
  onSettled(() => {});

  return (
    <>
      <div>Test2 me sheet</div>
    </>
  );
}
