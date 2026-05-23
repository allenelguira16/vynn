/// <reference types="vite/client" />

import { Router } from "vynn-router";

import { routes } from "./routes";

// const Comp = lazy(async () => ({ default: () => <>Test</> }));

export const App = ({ url }: { url: string }) => {
  return (
    <>
      {/* <Contexts /> */}
      {/* <Dropdowns /> */}
      {/* <Lazy />
      <Forms /> */}
      <Router url={url} routes={routes} />
      {/* <StackedSuspense /> */}
      {/* <Dropdowns /> */}
      {/* <div>
        <div>Hi</div>
        <Suspense>
          <Comp />
        </Suspense>
      </div> */}
    </>
  );
};
