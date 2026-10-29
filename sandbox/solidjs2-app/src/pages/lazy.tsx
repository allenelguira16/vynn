import { lazy, Loading } from "solid-js";

import { Template } from "../components/template";

const LazyImport = lazy(() => import("../components/lazy-import"));

const LazyTest = lazy(() => import("../components/test"));

export default function Lazy() {
  return (
    <Template title="Lazy">
      <div>
        <Loading fallback="Tester">
          <h4>Test</h4>
          <LazyImport />
        </Loading>

        <Loading fallback="Tester2">
          <LazyTest />
        </Loading>

        <h5>Test</h5>
      </div>
    </Template>
  );
}
