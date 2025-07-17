import { $computed, $effect, $state, onDestroy } from "vynn";

import { Template } from "~/components/Template";
import { name } from "~/utils";

export default function Forms() {
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
          <Counter />
          <Input />
        </div>
      </div>
    </Template>
  );
}

function Counter() {
  const count = $state(0);
  const double = $computed(() => count.value);

  const handleCount = () => {
    count.value++;
  };

  $effect(() => {
    console.log(count.value);
  });

  $effect(() => {
    console.log(double.value);
  });

  onDestroy(() => {
    console.log("bye");
  });

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
}

function Input() {
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
}
