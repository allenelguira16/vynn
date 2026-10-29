import "./main.css";

import { createRouter } from "@solidjs/router";
import { Portal } from "@solidjs/web";
import { lazy, Loading } from "solid-js";
import { ButtonPageList } from "./components/button-page-list";
import { name } from "./utils";

// import Lazy from "./pages/lazy";
// import Forms from "./pages/forms";
// import Contexts from "./pages/context";
// import Dropdowns from "./pages/dropdown-list";
// import NonAsyncSuspense from "./pages/non-async-suspense";
// import PokeDex from "./pages/poke-dex";
// import PokeDexAwait from "./pages/poke-dex-await";
// import StackedSuspense from "./pages/stacked-suspense";
// import ComponentError from "./pages/component-error";

const Contexts = lazy(() => import("./pages/context"));
const Dropdowns = lazy(() => import("./pages/dropdown-list"));
const Forms = lazy(() => import("./pages/forms"));
const Lazy = lazy(() => import("./pages/lazy"));
const NonAsyncSuspense = lazy(() => import("./pages/non-async-suspense"));
const PokeDex = lazy(() => import("./pages/poke-dex"));
const PokeDexAwait = lazy(() => import("./pages/poke-dex-await"));
const StackedSuspense = lazy(() => import("./pages/stacked-suspense"));
const ComponentError = lazy(() => import("./pages/component-error"));

export default function App(props: { url: string }) {
  return (
    <>
      <Loading fallback="Page Is Loading">
        <Router>
          {(props) => {
            return (
              <div class="p-2 flex flex-col container m-auto">
                {"<div>Hi</div>"}

                <Portal mount={document.body}>{name.firstName}</Portal>
                <ButtonPageList />

                {props.children}
              </div>
            );
          }}
        </Router>
      </Loading>
    </>
  );
}

const Router = createRouter({
  routes: [
    {
      path: "/",
      component: () => (
        <>
          <div>Hi</div>
          {/* <div>Hi</div> */}
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
      path: "/non-async-suspense",
      component: () => <NonAsyncSuspense />,
    },
    {
      path: "/stacked-suspense",
      component: () => <StackedSuspense />,
    },
  ],
});

// const routes = createRouter();
