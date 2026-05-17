import { $store, memo, resource, Suspense } from "vynn";

import { Template } from "~/components/Template";
import { sleep } from "~/utils";

export const StackedSuspense = memo(() => {
  const msg3 = $store({ data: "" });
  const msg2 = resource(async () => {
    console.log("called");
    await sleep(2000);

    return "hello world 2";
  }, []);

  return (
    <Template title="Stacked Suspense">
      <div class="p-2 flex flex-col container m-auto">
        {!msg2.loading && (
          <input
            onInput={(event) => {
              msg2.mutate(event.currentTarget.value.toString());
            }}
            value={msg2.data}
          ></input>
        )}
        <Suspense>{msg3.data}</Suspense>
        <Suspense fallback={<div>loading 1...</div>}>
          <Component />
          <Suspense fallback={<div>loading 2...</div>}>{msg2.data}</Suspense>
        </Suspense>
      </div>
    </Template>
  );
});

const Component = memo(() => {
  const msg = resource(async () => {
    await sleep(1000);

    return `hello world`;
  }, []);

  return <div>{msg.data}</div>;
});
