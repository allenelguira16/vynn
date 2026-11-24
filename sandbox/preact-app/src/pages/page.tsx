import { lazy, Suspense } from "preact/compat";

const LazyPage = lazy(() => import("./lazy/page"));
const FormsPage = lazy(() => import("./forms/page"));
const ContextPage = lazy(() => import("./context/page"));
const DropdownListPage = lazy(() => import("./dropdown-list/page"));
const ComponentErrorPage = lazy(() => import("./component-error/page"));
const NonAsyncSuspensePage = lazy(() => import("./non-async-suspense/page"));
const StackedSuspensePage = lazy(() => import("./stacked-suspense/page"));
const PokeDexPage = lazy(() => import("./poke-dex/page"));
const PokeDexAwaitPage = lazy(() => import("./poke-dex-await/page"));

export default function RootPage() {
  return (
    <>
      <Suspense fallback="Loading..."><LazyPage /></Suspense>
      <Suspense fallback="Loading..."><FormsPage /></Suspense>
      <Suspense fallback="Loading..."><ContextPage /></Suspense>
      <Suspense fallback="Loading..."><DropdownListPage /></Suspense>
      <Suspense fallback="Loading..."><ComponentErrorPage /></Suspense>
      <Suspense fallback="Loading..."><NonAsyncSuspensePage /></Suspense>
      <Suspense fallback="Loading..."><PokeDexPage /></Suspense>
      <Suspense fallback="Loading..."><PokeDexAwaitPage /></Suspense>
      <Suspense fallback="Loading..."><StackedSuspensePage /></Suspense>
    </>
  );
}
