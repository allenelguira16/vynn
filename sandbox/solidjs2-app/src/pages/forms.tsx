import { createMemo, createSignal } from "solid-js";

import { Template } from "../components/template";
import { name, setName } from "../utils";

export default function Forms() {
  return (
    <Template title="Forms">
      <div>
        <div>
          <label class="break-all" for="name-input2">
            Hi {name.firstName}
          </label>

          <div>
            <input
              class="input"
              type="text"
              value={name.firstName}
              id="name-input2"
            />
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

export const Counter = () => {
  const [count, setCount] = createSignal(0);
  const double = createMemo(() => count() * 2);

  console.log("Counter created");

  const handleCount = () => {
    setCount((value) => value + 1);
  };

  return (
    <>
      {count()}

      <div>Count: {count()}</div>
      <div>Double Count: {double()}</div>

      <button class="btn" disabled={count() >= 5} onClick={handleCount}>
        Add counter
      </button>

      <div>{count() <= 3 ? <div>Hi</div> : "string"}</div>
    </>
  );
};

export const Input = () => {
  return (
    <div>
      <label class="break-all" for="name-input">
        Name {name.firstName} <span>Hi</span>
      </label>

      <div>
        <input
          id="name-input"
          type="text"
          class="input"
          value={name.firstName}
          onInput={(event) => {
            const value = event.currentTarget.value;

            setName((state) => {
              state.firstName = value;
            });
          }}
        />
      </div>
    </div>
  );
};
