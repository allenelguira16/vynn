import { useMemo, useState } from "react";
import { Template } from "../components/template";
import { useName } from "../context/name-context";

export default function FormsPage() {
  const { name, setName } = useName();

  return (
    <Template title="Forms">
      <div>
        <div>
          <label className="break-all" htmlFor="name-input2">
            Hi {name.firstName}
          </label>
          <div>
            <input
              className="input"
              type="text"
              value={name.firstName}
              id="name-input2"
              onChange={(event) =>
                setName((current) => ({ ...current, firstName: event.target.value }))
              }
            />
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

  console.log("Counter rendered");

  return (
    <>
      {count}
      <div>Count: {count}</div>
      <div>Double Count: {double}</div>
      <button
        className="btn"
        disabled={count >= 5}
        onClick={() => setCount((value) => value + 1)}
        type="button"
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
      <label className="break-all" htmlFor="name-input">
        Name {name.firstName} <span>Hi</span>
      </label>
      <div>
        <input
          id="name-input"
          type="text"
          className="input"
          value={name.firstName}
          onChange={(event) =>
            setName((current) => ({ ...current, firstName: event.target.value }))
          }
        />
      </div>
    </div>
  );
}
