import { $state, Await, onDestroy, onMount } from "vynn";

import { Template } from "../components/template";
import { sleep } from "../utils";

export const StackedSuspense = () => {
  const msg3 = $state(async () => {
    await sleep(300);

    return "hello world 3";
  });
  const msg2 = $state(async () => {
    await sleep(200);

    return "hello world 2";
  });
  console.log("suspense parent rerender");

  return (
    <Template title="Stacked Suspense">
      <Await fallback="Lick my ass">
        <input
          class="input w-full"
          onInput={(event) => (msg2.value = event.currentTarget.value)}
          value={msg2.value}
        ></input>
      </Await>
      <Await fallback="Ngee">{msg3.value}</Await>
      <Await fallback={<div>loading 1...</div>}>
        <div>hi</div>
        <Component />
        <Await fallback={<div>loading 2...</div>}>{msg2.value}</Await>
      </Await>
    </Template>
  );
};

const Component = () => {
  const msg = $state(async () => {
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
