import {
  createContext,
  createSignal,
  lazy,
  Loading,
  useContext,
} from "solid-js";

import type { Accessor, Setter } from "solid-js";

type NameContextValue = [Accessor<string>, Setter<string>];

const NameProvider = createContext<NameContextValue>();

export default function LazyImport() {
  const name = createSignal("test");

  return (
    <NameProvider value={name}>
      <Children />
    </NameProvider>
  );
}

const Test2 = lazy(() => import("./test2"));

const Children = () => {
  const [name, setName] = useContext(NameProvider);

  return (
    <>
      <div>Hi I'm {name()} and I'm from LazyImport</div>

      <input
        class="input"
        onInput={(event) => {
          setName(event.currentTarget.value);
        }}
        value={name()}
      />

      <Loading>
        <Test2 />
      </Loading>
    </>
  );
};
