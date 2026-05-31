import { $computed, $effect, $state, memo } from "vynn";

import { Template } from "~/components/Template";
import { name } from "~/utils";

export const Forms = memo(() => {
  return (
    <Template title="Forms">
      <div>
        <div>
          <label class="break-all" for="name-input2">
            Hi {name.firstName}
          </label>
          <div>
            <input type="text" value={name.firstName} id="name-input2" />
          </div>
        </div>
        <div>
          <Counter key={1} />
          <Input key={2} />
        </div>
      </div>
    </Template>
  );
});

export const Counter = memo(() => {
  const count = $state(0);
  const double = $computed(() => count.value * 2);

  const handleCount = () => {
    count.value++;
  };

  $effect(() => {
    // console.log(count.value);
  });

  $effect(() => {
    // console.log(double.value);
  });

  console.log("rerender?");

  return (
    <>
      {count.value}
      <div>Count: {count.value}</div>
      <div>Double Count: {double.value}</div>
      <button disabled={count.value >= 5} onClick={handleCount}>
        Add counter
      </button>
      <div>{count.value <= 3 ? <div>Hi</div> : "string"}</div>
    </>
  );
});

export const Input = memo(() => {
  return (
    <div>
      <label class="break-all" for="name-input">
        Name {name.firstName} <span>Hi</span>
      </label>
      <div>
        <input
          id="name-input"
          type="text"
          onInput={(event) => {
            name.firstName = event.currentTarget.value;
          }}
          value={name.firstName}
        />
      </div>
    </div>
  );
});
