import {
  createMemo,
  createSignal,
  Loading,
  onCleanup,
  onSettled,
} from "solid-js";

import { Template } from "../components/template";
import { sleep } from "../utils";

export default function StackedSuspense() {
  const msg3 = createMemo(async () => {
    await sleep(3000);

    return "hello world 3";
  });

  const msg2 = createMemo(async () => {
    await sleep(2000);

    return "hello world 2";
  });

  // The async memo provides the initial value.
  // Once the input changes, the override becomes the displayed value.
  const [msg2Override, setMsg2Override] = createSignal<string | undefined>(
    undefined,
  );

  const msg2Value = createMemo(() => msg2Override() ?? msg2());

  console.log("suspense parent rerender");
  // Runs when the component is created, not on every reactive update.

  return (
    <Template title="Stacked Suspense">
      <div class="p-2 flex flex-col container m-auto">
        <Loading fallback="Lick my ass">
          <input
            class="input w-full"
            value={msg2Value()}
            onInput={(event) => {
              setMsg2Override(event.currentTarget.value);
            }}
          />
        </Loading>

        <Loading fallback="Ngee">
          <div>{msg3()}</div>
        </Loading>

        <Loading fallback={<div>loading 1...</div>}>
          <div>hi</div>

          <Component />

          <Loading fallback={<div>loading 2...</div>}>
            <div>{msg2Value()}</div>
          </Loading>
        </Loading>
      </div>
    </Template>
  );
}

const Component = () => {
  const msg = createMemo(async () => {
    await sleep(1000);

    return "hello world";
  });

  console.log("suspense inner rerender");
  // This also runs when the component is created.

  onSettled(() => {
    console.log("bumalik...");
  });

  onCleanup(() => {
    console.log("nawala...");
  });

  return <div>{msg()}</div>;
};
