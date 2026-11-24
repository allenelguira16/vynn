import { useMemo, useState } from "preact/hooks";
import { Template } from "../../components/template";
import { useName } from "../../context/name-context";

export default function FormsPage() {
  const { name } = useName();

  return (
    <Template title="Forms">
      <div>
        <div>
          <label class="break-all" for="name-input2">
            Hi {name.firstName}
          </label>
          <div>
            <input class="input" type="text" value={name.firstName} id="name-input2" />
          </div>
        </div>
        <div>
          <Counter />
          <NameInput />
        </div>
      </div>
    </Template>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  const double = useMemo(() => count * 2, [count]);

  return (
    <>
      {count}
      <div>Count: {count}</div>
      <div>Double Count: {double}</div>
      <button
        class="btn"
        disabled={count >= 5}
        onClick={() => setCount((value) => value + 1)}
      >
        Add counter
      </button>
      <div>{count <= 3 ? <div>Hi</div> : "string"}</div>
    </>
  );
}

function NameInput() {
  const { name, setName } = useName();

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
          onInput={(event) =>
            setName({ ...name, firstName: event.currentTarget.value })
          }
          value={name.firstName}
        />
      </div>
    </div>
  );
}
