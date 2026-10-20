import { Route, Router } from "vynn-router";
import { Portal } from "vynn";
import { ButtonPageList } from "./components/button-page-list";
import { name } from "./utils";

import { Lazy } from "./pages/lazy";
import { Forms } from "./pages/forms";
import { Contexts } from "./pages/context";
import { Dropdowns } from "./pages/dropdown-list";
import { NonAsyncSuspense } from "./pages/non-async-suspense";
import { PokeDex } from "./pages/poke-dex";
import { PokeDexAwait } from "./pages/poke-dex-await";
import { StackedSuspense } from "./pages/stacked-suspense";

// const Contexts = lazy(() => import("./pages/context"), "Contexts");
// const Dropdowns = lazy(() => import("./pages/dropdown-list"), "Dropdowns");
// const Forms = lazy(() => import("./pages/forms"), "Forms");
// const Lazy = lazy(() => import("./pages/lazy"), "Lazy");
// const NonAsyncSuspense = lazy(
//   () => import("./pages/non-async-suspense"),
//   "NonAsyncSuspense",
// );
// const PokeDex = lazy(() => import("./pages/poke-dex"), "PokeDex");
// const PokeDexAwait = lazy(
//   () => import("./pages/poke-dex-await"),
//   "PokeDexAwait",
// );
// const StackedSuspense = lazy(
//   () => import("./pages/stacked-suspense"),
//   "StackedSuspense",
// );

export function App() {
  return (
    <>
      {/* <Await fallback={<div>Page Is Loading</div>}> */}
      <Router routes={routes} />
      {/* </Await> */}
    </>
  );
}

export const routes: Route[] = [
  {
    path: "/",
    component: (props) => {
      // console.log("rerendering app component");

      // console.log();
      return (
        <div class="p-2 flex flex-col container m-auto">
          {"<div>Hi</div>"}

          <ButtonPageList />

          {/* <Await fallback={<div>Page Is Loading</div>}> */}
          {props.children}
          {/* </Await> */}
        </div>
      );
    },
    children: [
      {
        path: "/",
        component: () => (
          <>
            <Lazy />
            <Forms />
            <Contexts />
            <Dropdowns />
            <NonAsyncSuspense />
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
  },
];
