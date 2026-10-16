import { lazy, Await } from "vynn";

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
        <Await fallback="Tester">
          <h4>Test</h4>
          <LazyImport />
        </Await>
        <Await fallback="Tester2">
          <LazyTest />
        </Await>
        <h5>Test</h5>
      </div>
    </Template>
  );
};
