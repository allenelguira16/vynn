import { $async, onDestroy, onMount, Await } from "vynn";

import { Template } from "../components/template";
import { sleep } from "../utils";

export const StackedSuspense = () => {
  const msg3 = $async(async () => {
    await sleep(300);

    return "hello world 3";
  });
  const msg2 = $async(async () => {
    await sleep(200);

    return "hello world 2";
  });
  console.log("suspense parent rerender");

  return (
    <>
      <Template title="Stacked Suspense">
        <div class="p-2 flex flex-col container m-auto">
          <Await fallback="Lick my ass">
            <input
              class="input w-full"
              onInput={(event) => {
                msg2.value = event.currentTarget.value.toString();
              }}
              value={msg2.value}
            ></input>
          </Await>
          <Await fallback="Ngee">{msg3.value}</Await>
          <Await fallback={<div>loading 1...</div>}>
            <div>hi</div>
            <Component />
            <Await fallback={<div>loading 2...</div>}>{msg2.value}</Await>
          </Await>
        </div>
      </Template>
    </>
  );
};

const Component = () => {
  const msg = $async(async () => {
    await sleep(100);

    return `hello world`;
  });
  console.log("suspense inner rerender");
  onMount(() => {
    console.log("bumalik...");
  });
  onDestroy(() => {
    console.log("nawala...");
  });

  return <div>{msg.value}</div>;
};
