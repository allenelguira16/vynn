import { $store, memo, resource, Suspense } from "vynn";

import { sleep } from "~/utils";

export const StackedSuspense = memo(() => {
  const msg3 = $store({ data: "asd" });
  const msg2 = resource(async () => {
    await sleep(2000);

    return "hello world 2";
  }, []);

  return (
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
        <Suspense fallback={<div>loading 2...</div>}>{msg2.data}</Suspense>
        <Component />
      </Suspense>
    </div>
  );
});

const Component = memo(() => {
  const msg = resource(async () => {
    await sleep(1000);

    return `hello world`;
  }, []);

  console.log("rerun");

  return <div>{msg.data}</div>;
});
