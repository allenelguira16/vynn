import { lazy } from "vynn";

const ComponentError = lazy(() => import("./component-error/page"));
const Contexts = lazy(() => import("./context/page"));
const Dropdowns = lazy(() => import("./dropdown-list/page"));
const Forms = lazy(() => import("./forms/page"));
const Lazy = lazy(() => import("./lazy/page"));
const NonAsyncSuspense = lazy(() => import("./non-async-suspense/page"));
const PokeDexAwait = lazy(() => import("./poke-dex-await/page"));
const PokeDex = lazy(() => import("./poke-dex/page"));
const StackedSuspense = lazy(() => import("./stacked-suspense/page"));

export default function RootPage() {
  return (
    <>
      <Lazy />
      <Forms />
      <Contexts />
      <Dropdowns />
      <ComponentError />
      <NonAsyncSuspense />
      <PokeDex />
      <PokeDexAwait />
      <StackedSuspense />
    </>
  );
}
