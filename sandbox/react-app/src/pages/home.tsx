import { Suspense } from "react";
import type { ReactNode } from "react";
import {
  ComponentErrorPage,
  ContextsPage,
  DropdownsPage,
  FormsPage,
  LazyPage,
  NonAsyncSuspensePage,
  PokeDexAwaitPage,
  PokeDexPage,
  StackedSuspensePage,
} from "./route-pages";

function DemoBoundary(props: { children: ReactNode }) {
  return <Suspense fallback={<div>Page is loading...</div>}>{props.children}</Suspense>;
}

export default function HomePage() {
  return (
    <>
      <DemoBoundary><LazyPage /></DemoBoundary>
      <DemoBoundary><FormsPage /></DemoBoundary>
      <DemoBoundary><ContextsPage /></DemoBoundary>
      <DemoBoundary><DropdownsPage /></DemoBoundary>
      <DemoBoundary><ComponentErrorPage /></DemoBoundary>
      <DemoBoundary><NonAsyncSuspensePage /></DemoBoundary>
      <DemoBoundary><PokeDexPage /></DemoBoundary>
      <DemoBoundary><PokeDexAwaitPage /></DemoBoundary>
      <DemoBoundary><StackedSuspensePage /></DemoBoundary>
    </>
  );
}
