import { memo, resource, Suspense } from "vynn";

import { Template } from "~/components/Template";
import { sleep } from "~/utils";

export const StackedSuspense = memo(() => {
  const msg2 = resource(async () => {
    await sleep(2000);

    return "hello world 2";
  }, []);

  return (
    <Template title="Stacked Suspense">
      <div class="p-2 flex flex-col container m-auto">
        <Suspense fallback={<div>loading 1...</div>}>
          <Suspense fallback={<div>loading 2...</div>}>{msg2.data}</Suspense>
          <Component />
        </Suspense>
      </div>
    </Template>
  );
});

const Component = memo(() => {
  const msg = resource(async () => {
    await sleep(1000);

    return "hello world";
  }, []);

  console.log("rerun");

  return <div>{msg.data}</div>;
});
