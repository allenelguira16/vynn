import { Suspense } from "vynn";

export function NonAsyncSuspense() {
  return (
    <div>
      <Suspense fallback={<div>hi</div>}>
        <div>Children</div>
      </Suspense>
    </div>
  );
}
