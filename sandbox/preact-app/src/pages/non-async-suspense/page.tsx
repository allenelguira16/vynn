import { Suspense } from "preact/compat";
import { Template } from "../../components/template";

export default function NonAsyncSuspensePage() {
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
