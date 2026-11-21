import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Outlet, Route, Routes } from "react-router";
import { createPortal } from "react-dom";

import { ButtonPageList } from "./components/button-page-list";
import { Template } from "./components/template";
import { NameProvider, useName } from "./context/name-context";
import {
  ComponentErrorPage,
  ContextsPage,
  DropdownsPage,
  FormsPage,
  LazyPage,
  NonAsyncSuspensePage,
  NotFoundPage,
  ParamsPage,
  PokeDexAwaitPage,
  PokeDexPage,
  RedirectPage,
  StackedSuspensePage,
} from "./pages/route-pages";
import HomePage from "./pages/home";

function PageBoundary(props: { children: ReactNode }) {
  return <Suspense fallback={<div>Page is loading...</div>}>{props.children}</Suspense>;
}

function Layout() {
  return (
    <div className="flex">
      <nav className="flex h-screen w-1/8">
        <ButtonPageList />
      </nav>

      <main className="flex-1 overflow-auto h-screen p-4">
        <div className="container mx-auto">
          <div className="flex flex-col gap-8">
            <Outlet />
            <div id="portal-target" />
          </div>
        </div>
      </main>

      <PortalNotice />
    </div>
  );
}

function PortalNotice() {
  const { name } = useName();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("portal-target"));
  }, []);

  return target
    ? createPortal(<Template title="Portal">{name.firstName}</Template>, target)
    : null;
}

export default function App() {
  return (
    <NameProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="lazy" element={<PageBoundary><LazyPage /></PageBoundary>} />
          <Route path="forms" element={<PageBoundary><FormsPage /></PageBoundary>} />
          <Route path="contexts" element={<PageBoundary><ContextsPage /></PageBoundary>} />
          <Route path="dropdown-list" element={<PageBoundary><DropdownsPage /></PageBoundary>} />
          <Route path="component-error" element={<PageBoundary><ComponentErrorPage /></PageBoundary>} />
          <Route path="non-async-suspense" element={<PageBoundary><NonAsyncSuspensePage /></PageBoundary>} />
          <Route path="stacked-suspense" element={<PageBoundary><StackedSuspensePage /></PageBoundary>} />
          <Route path="poke-dex" element={<PageBoundary><PokeDexPage /></PageBoundary>} />
          <Route path="poke-dex-await" element={<PageBoundary><PokeDexAwaitPage /></PageBoundary>} />
          <Route path="redirect" element={<PageBoundary><RedirectPage /></PageBoundary>} />
          <Route path="params/:id" element={<PageBoundary><ParamsPage /></PageBoundary>} />
          <Route path="*" element={<PageBoundary><NotFoundPage /></PageBoundary>} />
        </Route>
      </Routes>
    </NameProvider>
  );
}
