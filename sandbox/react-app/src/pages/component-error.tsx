import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/error-boundary";
import { Template } from "../components/template";

function Crash(props: { explode: boolean }) {
  if (props.explode) {
    throw new Error("Component error caught. Please retry.");
  }

  return <p>The component recovered.</p>;
}

function CrashAfterClicks() {
  const [count, setCount] = useState(0);

  if (count > 5) {
    throw new Error("The component failed after six updates.");
  }

  return (
    <div>
      <div>Count: {count}</div>
      <button className="btn" onClick={() => setCount((value) => value + 1)} type="button">
        Add
      </button>
    </div>
  );
}

function ErrorCard(props: { title: string; children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">{props.title}</h2>
        <ErrorBoundary
          fallback={(error, reset) => (
            <div>
              <p>{error.message}</p>
              <button
                className="btn"
                onClick={() => {
                  props.onRetry?.();
                  reset();
                }}
                type="button"
              >
                Try Again
              </button>
            </div>
          )}
        >
          {props.children}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function ComponentErrorPage() {
  const [explode, setExplode] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setExplode(true);
  }, []);

  return (
    <Template title="Error Boundary">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ErrorCard
          title="Render error"
          onRetry={() => {
            setExplode(false);
            setRetryKey((value) => value + 1);
          }}
        >
          <Crash explode={explode} key={retryKey} />
        </ErrorCard>
        <ErrorCard
          title="Update error"
          onRetry={() => setRetryKey((value) => value + 1)}
        >
          <CrashAfterClicks key={retryKey} />
        </ErrorCard>
        <ErrorCard title="Independent boundary">
          <p>This card continues rendering independently of the other boundaries.</p>
        </ErrorCard>
      </div>
    </Template>
  );
}
