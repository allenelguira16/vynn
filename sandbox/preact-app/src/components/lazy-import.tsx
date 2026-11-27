import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";

const NameContext = createContext<{
  name: string;
  setName: (value: string) => void;
}>({ name: "test", setName: () => {} });

export default function LazyImport() {
  const [name, setName] = useState("test");

  return (
    <NameContext.Provider value={{ name, setName }}>
      <Children />
    </NameContext.Provider>
  );
}

const Test2 = lazy(() => import("./test2"));

function Children() {
  const { name, setName } = useContext(NameContext);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCount((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div>Hi I'm {name} and I'm from LazyImport</div>
      <input
        class="input"
        onInput={(event) => setName(event.currentTarget.value)}
        value={name}
      />
      <div>Mounted for {count} seconds</div>
      <Suspense fallback="Loading nested lazy import...">
        <Test2 />
      </Suspense>
    </>
  );
}
