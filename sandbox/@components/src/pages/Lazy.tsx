import { lazy, Suspense } from "vynn";

import { Template } from "~/components/Template";

const LazyImport = lazy(() => import("~/components/LazyImport"), "LazyImport");
const LazyTest = lazy(() => import("~/components/Test"), "Test");

export const Lazy = () => {
  return (
    <Template title="Lazy">
      <div>
        <Suspense fallback="Tester">
          <LazyImport />
        </Suspense>
        <Suspense>
          <LazyTest />
        </Suspense>
        <h1>Test</h1>
      </div>
    </Template>
  );
};
