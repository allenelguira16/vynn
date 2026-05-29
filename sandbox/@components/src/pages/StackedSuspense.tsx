import { memo, resource, Suspense } from "vynn";

import { Template } from "~/components/Template";
import { sleep } from "~/utils";

export const StackedSuspense = memo(() => {
  const msg3 = resource(async () => {
    // console.log("called");
    await sleep(2000);

    return "hello world 3";
  }, []);
  const msg2 = resource(async () => {
    // console.log("called");
    await sleep(2000);

    return "hello world 2";
  }, []);

  console.log("suspense parent rerender");

  return (
    <Template title="Stacked Suspense">
      <div class="p-2 flex flex-col container m-auto">
        <Suspense fallback="Lick my ass">
          <input
            onInput={(event) => {
              msg2.mutate(event.currentTarget.value.toString());
            }}
            value={msg2.data}
          ></input>
        </Suspense>
        <Suspense fallback="Ngee">{msg3.data}</Suspense>
        <Suspense fallback={<div>loading 1...</div>}>
          <Component />
          <Suspense fallback={<div>loading 2...</div>}>{msg2.data}</Suspense>
          <div>hi</div>
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

  console.log("suspense inner rerender");

  return <div>{msg.data}</div>;
});
