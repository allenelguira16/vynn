import { Route, Router } from "vynn-router";
import { lazy, Portal, Suspense } from "vynn";
import { ButtonPageList } from "./components/button-page-list";
import { name } from "./utils";

const Contexts = lazy(() => import("./pages/context"), "Contexts");
const Dropdowns = lazy(() => import("./pages/dropdown-list"), "Dropdowns");
const Forms = lazy(() => import("./pages/forms"), "Forms");
const Lazy = lazy(() => import("./pages/lazy"), "Lazy");
const NonAsyncSuspense = lazy(
  () => import("./pages/non-async-suspense"),
  "NonAsyncSuspense",
);
const PokeDex = lazy(() => import("./pages/poke-dex"), "PokeDex");
const PokeDexSuspense = lazy(
  () => import("./pages/poke-dex-suspense"),
  "PokeDexSuspense",
);
const PokeDexAwait = lazy(
  () => import("./pages/poke-dex-await"),
  "PokeDexAwait",
);
const StackedSuspense = lazy(
  () => import("./pages/stacked-suspense"),
  "StackedSuspense",
);

export function App() {
  return (
    <>
      {/* <Suspense fallback={<div>Page Is Loading</div>}> */}
      <Router routes={routes} />
      {/* </Suspense> */}
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
          <Portal mount={document.body}>{name.firstName}</Portal>
          <ButtonPageList />

          <Suspense fallback={<div>Page Is Loading</div>}>
            {props.children}
          </Suspense>
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
            <PokeDexSuspense />
            <StackedSuspense />
          </>
        ),
      },
      {
        path: "/lazy",
        component: () => <Lazy />,
      },
      // {
      //   path: "/test",
      //   children: [
      //     {
      //       path: "/",
      //       component: () => {
      //         return <div>Child</div>;
      //       },
      //     },
      //     {
      //       path: "/test",
      //       component: () => {
      //         return <div>2nd Child</div>;
      //       },
      //     },
      //   ],
      // },
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
        path: "/poke-dex-suspense",
        component: () => <PokeDexSuspense />,
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
