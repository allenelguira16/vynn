import { $effect, $state, createContext, lazy, onMount, State, Suspense, useContext } from "vynn";

const NameProvider = createContext<State<string>>();

export function LazyImport() {
  const name = $state("test");
  onMount(() => {});

  $effect(() => {});

  return (
    <NameProvider.Provider value={name}>
      <Children />
    </NameProvider.Provider>
  );
}

const Test2 = lazy(() => import("./Test2"), "Test2");

const Children = () => {
  const name = useContext(NameProvider);

  return (
    <>
      <div>Hi I'm {name.value} and I'm from LazyImport</div>
      <input onInput={(event) => (name.value = event.currentTarget.value)} value={name.value} />
      <Suspense>
        <Test2 />
      </Suspense>
    </>
  );
};
