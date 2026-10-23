import { $state, ErrorBoundary, JSX } from "vynn";
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
  const count = $state(0);
  const willThrow = () => {
    throw new Error("ComponentWIllThrowLater catched, please retry again");
  };

  return (
    <div>
      <div>
        Count: {count.value}
        {count.value > 5 && willThrow()}
      </div>
      <button class="btn" onClick={() => count.value++}>
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
