import { Errored, JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { Template } from "../components/template";

function ComponentWillThrow(): JSX.Element {
  const willThrow = () => {
    throw new Error("ComponentWIllThrow catched, please retry again");
  };

  return (
    <div>
      <div>{willThrow()}</div>
    </div>
  );
}

function ComponentWillThrowLater(): JSX.Element {
  const [count, setCount] = createSignal(0);
  const willThrow = () => {
    throw new Error("ComponentWIllThrowLater catched, please retry again");
  };

  return (
    <div>
      <div>
        Count: {count()}
        {count() > 5 && willThrow()}
      </div>
      <button class="btn" onClick={() => setCount(count() + 1)}>
        Add
      </button>
    </div>
  );
}

export default function ComponentError() {
  return (
    <Template title="Error Boundary">
      <Errored
        fallback={(error, reset) => (
          <div>
            <p>{String(error())}</p>
            <button
              class="btn"
              onClick={() => {
                console.log("hi?");
                reset();
              }}
            >
              Try Again
            </button>
          </div>
        )}
      >
        <ComponentWillThrow />
      </Errored>
      <Errored
        fallback={(error, reset) => (
          <div>
            <p>{String(error())}</p>
            <button
              class="btn"
              onClick={() => {
                console.log("hi!");
                reset();
              }}
            >
              Try Again
            </button>
          </div>
        )}
      >
        <ComponentWillThrowLater />
      </Errored>
    </Template>
  );
}
