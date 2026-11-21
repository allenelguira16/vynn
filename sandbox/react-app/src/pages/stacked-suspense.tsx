import { Suspense, use, useState } from "react";
import { Template } from "../components/template";
import { sleep } from "../utils";

const messages = new Map<string, Promise<string>>();

function delayedMessage(key: string, ms: number, value: string) {
  const cached = messages.get(key);

  if (cached) return cached;

  const promise = sleep(ms).then(() => value);
  messages.set(key, promise);
  return promise;
}

function AsyncMessage(props: { id: string; delay: number; value: string }) {
  return <div>{use(delayedMessage(props.id, props.delay, props.value))}</div>;
}

function AsyncInput(props: { value: string; onChange: (value: string) => void }) {
  const initial = use(delayedMessage("stacked-input", 2000, "hello world 2"));

  return (
    <input
      className="input w-full"
      value={props.value || initial}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

function InnerComponent() {
  return <AsyncMessage id="stacked-inner" delay={1000} value="hello world" />;
}

export default function StackedSuspensePage() {
  const [messageOverride, setMessageOverride] = useState("");

  return (
    <Template title="Stacked Suspense">
      <div className="p-2 flex flex-col container m-auto">
        <Suspense fallback="Lick my ass">
          <AsyncInput value={messageOverride} onChange={setMessageOverride} />
        </Suspense>
        <Suspense fallback="Ngee">
          <AsyncMessage id="stacked-third" delay={3000} value="hello world 3" />
        </Suspense>
        <Suspense fallback={<div>loading 1...</div>}>
          <div>hi</div>
          <InnerComponent />
          <Suspense fallback={<div>loading 2...</div>}>
            <AsyncMessage
              id="stacked-second"
              delay={2000}
              value={messageOverride || "hello world 2"}
            />
          </Suspense>
        </Suspense>
      </div>
    </Template>
  );
}
