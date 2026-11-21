import { Suspense, useEffect } from "react";
import { Template } from "../components/template";

export default function NonAsyncSuspensePage() {
  useEffect(() => {
    console.log("Non-async Suspense demo mounted.");
  }, []);

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
