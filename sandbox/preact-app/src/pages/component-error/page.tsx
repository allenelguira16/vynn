import { useState } from "preact/hooks";
import { Suspense, use } from "preact/compat";
import type { ComponentChildren } from "preact";

import { Catch } from "../../components/catch";
import { Template } from "../../components/template";
import { sleep } from "../../utils";

const delayedValues = new Map<string, Promise<number>>();

function getDelayedValue(key: string, value: number) {
  let promise = delayedValues.get(key);

  if (!promise) {
    promise = sleep(100).then(() => value);
    delayedValues.set(key, promise);
    promise.catch(() => delayedValues.delete(key));
  }

  return promise;
}

function ComponentWillThrow() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error("ComponentWillThrow caught, please retry again");
  }

  return (
    <div>
      <div>hi</div>
      <button class="btn" onClick={() => setShouldThrow(true)}>
        Trigger error
      </button>
    </div>
  );
}

function AsyncCount(props: { count: number }) {
  const count = use(getDelayedValue("async-" + props.count, props.count));

  if (count > 5) {
    throw new Error("ComponentWillThrowAfterAsync caught, please retry again");
  }

  return <div>Count: {count}</div>;
}

function ComponentWillThrowAfterAsync() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <Suspense fallback="Loading siya..">
        <AsyncCount count={count} />
        <button class="btn" onClick={() => setCount((value) => value + 1)}>
          Add
        </button>
      </Suspense>
    </div>
  );
}

function ComponentWillThrowAfterCount() {
  const [count, setCount] = useState(0);

  if (count > 5) {
    throw new Error("ComponentWillThrowAfterCount caught, please retry again");
  }

  return (
    <div>
      <div>Count: {count}</div>
      <button class="btn" onClick={() => setCount((value) => value + 1)}>
        Add
      </button>
    </div>
  );
}

function CatchCard(props: { title: string; children: ComponentChildren }) {
  return (
    <Template title={props.title} card>
      <Catch
        fallback={(error, reset) => (
          <div>
            <p>{String(error)}</p>
            <button class="btn" onClick={reset}>
              Try Again
            </button>
          </div>
        )}
      >
        {props.children}
      </Catch>
    </Template>
  );
}

export default function ComponentErrorPage() {
  return (
    <Template title="Error Boundary">
      <div class="flex gap-4">
        <CatchCard title="ComponentWillThrow">
          <ComponentWillThrow />
        </CatchCard>
        <CatchCard title="ComponentWillThrowAfterAsync">
          <ComponentWillThrowAfterAsync />
        </CatchCard>
        <CatchCard title="ComponentWillThrowAfterCount">
          <ComponentWillThrowAfterCount />
        </CatchCard>
      </div>
    </Template>
  );
}
