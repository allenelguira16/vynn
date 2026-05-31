import { $effect, $state, createContext, lazy, onMount, State, Suspense, useContext } from "vynn";

const NameContext = createContext<State<string>>();

export function LazyImport() {
  const name = $state("test");
  onMount(() => {});

  $effect(() => {
    console.log(name.value);
  });

  return (
    <NameContext.Provider value={name}>
      <Children />
    </NameContext.Provider>
  );
}

const Test2 = lazy(() => import("./Test2"), "Test2");

function Children() {
  const name = useContext(NameContext);

  return (
    <>
      <div>Hi I'm {name.value} and I'm from LazyImport</div>
      <input onInput={(event) => (name.value = event.currentTarget.value)} value={name.value} />
      <Suspense>
        <Test2 />
      </Suspense>
    </>
  );
}
