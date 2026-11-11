import { lazy } from "vynn";

const Contexts = lazy(() => import("./context/page.tsx"));
const Dropdowns = lazy(() => import("./dropdown-list/page.tsx"));
const Forms = lazy(() => import("./forms/page.tsx"));
const Lazy = lazy(() => import("./lazy/page.tsx"));
const NonAsyncSuspense = lazy(() => import("./non-async-suspense/page.tsx"));
const PokeDex = lazy(() => import("./poke-dex/page.tsx"));
const PokeDexAwait = lazy(() => import("./poke-dex-await/page.tsx"));
const StackedSuspense = lazy(() => import("./stacked-suspense/page.tsx"));
const ComponentError = lazy(() => import("./component-error/page.tsx"));

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
