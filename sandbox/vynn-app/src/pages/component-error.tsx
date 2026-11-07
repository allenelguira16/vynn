import { $computed, $state, Await, ErrorBoundary, isPending, JSX } from "vynn";

import { Template } from "../components/template";
import { sleep } from "../utils";

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
  const baseCount = $state(0);
  const count = $computed(async () => {
    const count = baseCount.value;

    await sleep(100);

    return count;
  });

  const willThrow = () => {
    throw new Error("ComponentWIllThrowLater catched, please retry again");
  };

  return (
    <div>
      <Await fallback="Loading siya..">
        <div>
          Count: {count.value}
          {count.value > 5 && willThrow()}
        </div>
      </Await>
      <button class="btn" onClick={() => baseCount.value++} disabled={isPending(count)}>
        Add
      </button>
    </div>
  );
}

export function ComponentError() {
  return (
    <Template title="Error Boundary">
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>{String(error)}</p>
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
      </ErrorBoundary>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>{String(error)}</p>
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
      </ErrorBoundary>
    </Template>
  );
}
