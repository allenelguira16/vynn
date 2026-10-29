import { onSettled, Loading } from "solid-js";

import { Template } from "../components/template";

export default function NonAsyncSuspense() {
  onSettled(() => {
    console.log("hi");
  });

  return (
    <Template title="Non-Async Suspense">
      <div>
        <Loading fallback={<div>hi</div>}>
          <div>Children</div>
        </Loading>
      </div>
    </Template>
  );
}
