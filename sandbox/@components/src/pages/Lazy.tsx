import { lazy, Suspense } from "vynn";

import { Template } from "~/components/Template";

const LazyImport = lazy(() => import("~/components/LazyImport"), "LazyImport");
const LazyTest = lazy(() => import("~/components/Test"), "Test");

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
