import { Await } from "vynn";

import { Template } from "../components/template";

export function NonAsyncSuspense() {
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
