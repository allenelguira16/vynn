import {
  $effect,
  $state,
  createContext,
  lazy,
  onMount,
  State,
  Suspense,
  // useContext,
} from "vynn";

const [NameProvider, useNameContext] = createContext<State<string>>();

export function LazyImport() {
  const name = $state("test");
  onMount(() => {});

  $effect(() => {});

  return (
    <NameProvider value={name}>
      <Children />
    </NameProvider>
  );
}

const Test2 = lazy(() => import("./test2"), "Test2");

const Children = () => {
  const name = useNameContext();

  return (
    <>
      <div>Hi I'm {name.value} and I'm from LazyImport</div>
      <input
        onInput={(event: any) => (name.value = event.currentTarget.value)}
        value={name.value}
      />
      <Suspense>
        <Test2 />
      </Suspense>
    </>
  );
};
