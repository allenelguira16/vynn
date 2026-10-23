import { ErrorBoundary, JSX } from "vynn";
import { Template } from "../components/template";

function ComponentWillThrow(): JSX.Element {
  const willThrow = () => {
    throw new Error("hi");
  };

  return (
    <div>
      <div>{willThrow()}</div>
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
    </Template>
  );
}
