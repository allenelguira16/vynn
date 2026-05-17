import { $effect, $state, createContext, lazy, onMount, State, Suspense } from "vynn";

const [Provider, context] = createContext<State<string>>();

export function LazyImport() {
  const name = $state("test");
  onMount(() => {});

  $effect(() => {});

  return (
    <Provider value={name}>
      <Children />
    </Provider>
  );
}

const Test2 = lazy(() => import("./Test2"), "Test2");

function Children() {
  const name = context();

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
