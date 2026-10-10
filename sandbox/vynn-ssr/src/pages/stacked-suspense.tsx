import { $async, $effect, onDestroy, onMount, Suspense } from "vynn";

import { Template } from "../components/template";
import { sleep } from "../utils";

export const StackedSuspense = () => {
  const msg3 = $async(async () => {
    await sleep(3000);

    return "hello world 3";
  });
  const msg2 = $async(async () => {
    await sleep(2000);

    return "hello world 2";
  });
  // console.log("suspense parent rerender");

  return (
    <Template title="Stacked Suspense">
      <div class="p-2 flex flex-col container m-auto">
        <Suspense fallback="Lick my ass">
          <input
            onInput={(event) => {
              msg2.value = event.currentTarget.value.toString();
            }}
            value={msg2.value}
          ></input>
        </Suspense>
        <Suspense fallback="Ngee">{msg3.value}</Suspense>
        <Suspense fallback={<div>loading 1...</div>}>
          <div>hi</div>
          <Component />
          <Suspense fallback={<div>loading 2...</div>}>{msg2.value}</Suspense>
        </Suspense>
      </div>
    </Template>
  );
};

const Component = () => {
  const msg = $async(async () => {
    await sleep(1000);

    return `hello world`;
  });
  // console.log("render");
  onMount(() => {
    // console.log("bumalik...");
  });
  onDestroy(() => {
    // console.log("nawala...");
  });

  $effect(() => {
    // console.log("suspense inner rerender");
    // console.log(msg.value);
  });

  return <div class="dang fuck you">{msg.value}</div>;
};
