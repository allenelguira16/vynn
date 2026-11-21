import { lazy, Suspense } from "react";
import { Template } from "../components/template";
import { sleep } from "../utils";

const LazyImport = lazy(async () => {
  await sleep(450);
  return import("../components/lazy-import");
});

const TestPanel = lazy(async () => {
  await sleep(750);
  return import("../components/test");
});

const TestPanelTwo = lazy(async () => {
  await sleep(950);
  return import("../components/test2");
});

export default function LazyPage() {
  return (
    <Template title="Lazy">
      <div>
        <Suspense fallback="Tester">
          <h4>Test</h4>
          <LazyImport />
        </Suspense>
        <Suspense fallback="Tester2"><TestPanel /></Suspense>
        <Suspense fallback="Tester3"><TestPanelTwo /></Suspense>
        <h5>Test</h5>
      </div>
    </Template>
  );
}
