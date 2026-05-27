/// <reference types="vite/client" />

import { Router } from "vynn-router";

import { routes } from "./routes";

// const Comp = lazy(async () => ({ default: () => <>Test</> }));

export function App({ url }: { url: string }) {
  // setInterval(() => {
  //   counter.value++;
  // }, 1000);

  return (
    <>
      {/* <Contexts /> */}
      {/* <Dropdowns /> */}
      {/* <Lazy /> */}
      {/* <Forms /> */}
      {/* <StackedSuspense /> */}
      <Router url={url} routes={routes} />
      {/* <Dropdowns /> */}
      {/* <div>
        <div>Hi</div>
        <Suspense>
          <Comp />
        </Suspense>
      </div> */}
    </>
  );
}
