/// <reference types="vite/client" />

import { $state } from "vynn";
import { Router } from "vynn-router";

import { routes } from "./routes";

// const Comp = lazy(async () => ({ default: () => <>Test</> }));

export function App({ url }: { url: string }) {
  const show = $state(true);
  // setInterval(() => {
  //   counter.value++;
  // }, 1000);

  return (
    <div>
      {/* <Contexts /> */}
      {/* <Dropdowns /> */}
      {/* <Lazy /> */}
      {/* <Forms /> */}
      {/* <StackedSuspense /> */}
      {/* <Suspense></Suspense> */}
      {show.value && <Router url={url} routes={routes} />}

      <button onClick={() => (show.value = !show.value)}>Toggle</button>
      {/* <Dropdowns /> */}
      {/* <div>
        <div>Hi</div>
        <Suspense>
          <Comp />
        </Suspense>
      </div> */}
    </div>
  );
}
