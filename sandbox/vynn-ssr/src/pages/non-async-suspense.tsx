import { Await, onMount } from "vynn";

import { Template } from "../components/template";

export function NonAsyncSuspense() {
  onMount(() => {
    console.log("hi");
  });

  return (
    <Template title="Non-Async Suspense">
      <div>
        <Await fallback={<div>hi</div>}>
          <div>Children</div>
        </Await>
      </div>
    </Template>
  );
}
