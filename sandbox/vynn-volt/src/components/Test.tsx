import { $effect, onMount } from "vynn";

export function Test() {
  onMount(() => {});

  $effect(() => {});

  return (
    <div>
      <test>Test me sheet</test>
    </div>
  );
}
