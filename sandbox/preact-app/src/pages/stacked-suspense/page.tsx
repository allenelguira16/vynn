import { Suspense, use } from "preact/compat";
import { useState } from "preact/hooks";

import { Template } from "../../components/template";
import { sleep } from "../../utils";

const messages = new Map<string, Promise<string>>();

function getMessage(value: string, ms: number) {
  const key = value + ":" + ms;
  let promise = messages.get(key);

  if (!promise) {
    promise = sleep(ms).then(() => value);
    messages.set(key, promise);
    promise.catch(() => messages.delete(key));
  }

  return promise;
}

function AsyncMessage(props: { value: string; delay: number }) {
  return <div>{use(getMessage(props.value, props.delay))}</div>;
}

function EditableMessage() {
  const [value, setValue] = useState("hello world 2");

  return (
    <Suspense fallback="Lick my ass">
      <input
        class="input w-full"
        onInput={(event) => setValue(event.currentTarget.value)}
        value={value}
      />
      <AsyncMessage value={value} delay={2000} />
    </Suspense>
  );
}

function Component() {
  return <AsyncMessage value="hello world" delay={1000} />;
}

export default function StackedSuspensePage() {
  return (
    <Template title="Stacked Suspense">
      <Suspense fallback="Lick my ass">
        <EditableMessage />
      </Suspense>
      <Suspense fallback="Ngee">
        <AsyncMessage value="hello world 3" delay={3000} />
      </Suspense>
      <Suspense fallback={<div>loading 1...</div>}>
        <div>hi</div>
        <Suspense fallback={<div>loading 2...</div>}>
          <Component />
        </Suspense>
      </Suspense>
    </Template>
  );
}
