import { Suspense } from "vynn";

import { Template } from "~/components/Template";

export default function NonAsyncSuspense() {
  return (
    <Template title="Non-Async Suspense">
      <div>
        <Suspense fallback={<div>hi</div>}>
          <div>Children</div>
        </Suspense>
      </div>
    </Template>
  );
}
