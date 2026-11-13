import { $computed, $state, Await, ErrorBoundary, isPending, JSX } from "vynn";

import { Template } from "../../components/template";
import { sleep } from "../../utils";

function ComponentWillThrow(): JSX.Element {
  const willThrow = () => {
    if (typeof window === "undefined") {
      throw new Error("ComponentWIllThrow catched, please retry again");
    }

    return "hi";
  };

  return (
    <div>
      <div>{willThrow()}</div>
    </div>
  );
}

function ComponentWillThrowAfterAsync(): JSX.Element {
  const count = $computed(async () => {
    await sleep(100);
    throw new Error("ComponentWillThrowAfterAsync catched, please retry again");
  });

  return (
    <div>
      <div>test</div>
      <div>{count.value}</div>
    </div>
  );
}

function ComponentWillThrowAfterCount(): JSX.Element {
  const baseCount = $state(() => 0);
  const count = $computed(async () => {
    const count = baseCount.value;

    await sleep(100);

    return count;
  });

  const willThrow = () => {
    throw new Error("ComponentWillThrowAfterCount catched, please retry again");
  };

  return (
    <div>
      <Await fallback="Loading siya..">
        <div>
          Count: {count.value}
          {count.value > 5 && willThrow()}
        </div>
        <button class="btn" onClick={() => baseCount.value++} disabled={isPending(count)}>
          Add
        </button>
      </Await>
    </div>
  );
}

export default function ComponentError() {
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
                console.log("hi~");
                reset();
              }}
            >
              Try Again
            </button>
          </div>
        )}
      >
        <ComponentWillThrowAfterAsync />
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
        <ComponentWillThrowAfterCount />
      </ErrorBoundary>
    </Template>
  );
}
