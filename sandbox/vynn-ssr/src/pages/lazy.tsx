import { lazy, Suspense } from "vynn";

import { Template } from "../components/template";

const LazyImport = lazy(
  () => import("../components/lazy-import"),
  "LazyImport",
);
const LazyTest = lazy(() => import("../components/test"), "Test");

export const Lazy = () => {
  return (
    <Template title="Lazy">
      <div>
        <Suspense fallback="Tester">
          <h4>Test</h4>
          <LazyImport />
        </Suspense>
        <Suspense fallback="Tester2">
          <LazyTest />
        </Suspense>
        <h5>Test</h5>
      </div>
    </Template>
  );
};
