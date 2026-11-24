import { Suspense, lazy } from "preact/compat";
import { Template } from "../../components/template";

const LazyImport = lazy(() => import("../../components/lazy-import"));
const LazyTest = lazy(() => import("../../components/test"));

export default function LazyPage() {
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
}
