import "./main.css";
import { createRouter } from "@solidjs/router";
import { Portal } from "@solidjs/web";
import { Loading, lazy } from "solid-js";

import { ButtonPageList } from "./components/button-page-list";
import { Template } from "./components/template";
import { name } from "./utils";

const Contexts = lazy(() => import("./pages/context"));
const Dropdowns = lazy(() => import("./pages/dropdown-list"));
const Forms = lazy(() => import("./pages/forms"));
const Lazy = lazy(() => import("./pages/lazy"));
const NonAsyncSuspense = lazy(() => import("./pages/non-async-suspense"));
const PokeDex = lazy(() => import("./pages/poke-dex"));
const PokeDexAwait = lazy(() => import("./pages/poke-dex-await"));
const StackedSuspense = lazy(() => import("./pages/stacked-suspense"));
const ComponentError = lazy(() => import("./pages/component-error"));
const Params = lazy(() => import("./pages/params"));
const Redirect = lazy(() => import("./pages/redirect"));
const NotFound = lazy(() => import("./pages/not-found"));

export default function App(props: { url: string }) {
  let content!: HTMLDivElement;

  return (
    <Loading fallback="Page Is Loading">
      <Router url={props.url}>
        {(routeProps) => (
          <>
            <div class="flex">
              <nav class="flex h-screen w-1/8">
                <ButtonPageList />
              </nav>
              <div class="flex-1 overflow-auto h-screen p-4" ref={content}>
                {routeProps.children}
              </div>
            </div>
            <Portal mount={content}>
              <Template title="Portal">{name.firstName}</Template>
            </Portal>
          </>
        )}
      </Router>
    </Loading>
  );
}

const Router = createRouter({
  routes: [
    {
      path: "/",
      component: () => (
        <>
          <div>Hi</div>
          <Lazy />
          <Forms />
          <Contexts />
          <Dropdowns />
          <NonAsyncSuspense />
          <ComponentError />
          <PokeDex />
          <PokeDexAwait />
          <StackedSuspense />
        </>
      ),
    },
    {
      path: "/lazy",
      component: () => <Lazy />,
    },
    {
      path: "/contexts",
      component: () => <Contexts />,
    },
    {
      path: "/poke-dex",
      component: () => <PokeDex />,
    },
    {
      path: "/poke-dex-await",
      component: () => <PokeDexAwait />,
    },
    {
      path: "/dropdown-list",
      component: () => <Dropdowns />,
    },
    {
      path: "/forms",
      component: () => <Forms />,
    },
    {
      path: "/component-error",
      component: () => <ComponentError />,
    },
    {
      path: "/non-async-suspense",
      component: () => <NonAsyncSuspense />,
    },
    {
      path: "/stacked-suspense",
      component: () => <StackedSuspense />,
    },
    {
      path: "/redirect",
      component: () => <Redirect />,
    },
    {
      path: "/params/:id",
      component: () => <Params />,
    },
    {
      path: "/*all",
      component: () => <NotFound />,
    },
  ],
});
