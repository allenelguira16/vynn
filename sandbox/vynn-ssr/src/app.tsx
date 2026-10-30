import { Route, Router } from "vynn-router";
import { $state, Await, lazy, onMount, Portal } from "vynn";
import { ButtonPageList } from "./components/button-page-list";
import { name } from "./utils";

// import { Lazy } from "./pages/lazy";
// import { Forms } from "./pages/forms";
// import { Contexts } from "./pages/context";
// import { Dropdowns } from "./pages/dropdown-list";
// import { NonAsyncSuspense } from "./pages/non-async-suspense";
// import { PokeDex } from "./pages/poke-dex";
// import { PokeDexAwait } from "./pages/poke-dex-await";
// import { StackedSuspense } from "./pages/stacked-suspense";
// import { ComponentError } from "./pages/component-error";

const Contexts = lazy(() => import("./pages/context"), "Contexts");
const Dropdowns = lazy(() => import("./pages/dropdown-list"), "Dropdowns");
const Forms = lazy(() => import("./pages/forms"), "Forms");
const Lazy = lazy(() => import("./pages/lazy"), "Lazy");
const NonAsyncSuspense = lazy(
  () => import("./pages/non-async-suspense"),
  "NonAsyncSuspense",
);
const PokeDex = lazy(() => import("./pages/poke-dex"), "PokeDex");
const PokeDexAwait = lazy(
  () => import("./pages/poke-dex-await"),
  "PokeDexAwait",
);
const StackedSuspense = lazy(
  () => import("./pages/stacked-suspense"),
  "StackedSuspense",
);
const ComponentError = lazy(
  () => import("./pages/component-error"),
  "ComponentError",
);

export default function App(props: { url: string }) {
  const counter = $state(0);

  onMount(() => {
    setInterval(() => {
      counter.value++;
    }, 1000);
  });

  return (
    <>
      <title>Vynn SSR Sandbox {counter.value}</title>
      <meta
        name="description"
        content="A server-rendered application built with Vynn."
      />
      <meta property="og:title" content="Vynn SSR Sandbox" />
      <meta
        property="og:description"
        content="A server-rendered application built with Vynn."
      />
      <meta property="og:type" content="website" />

      <Router routes={routes} url={props.url} />
    </>
  );
}

export const routes: Route[] = [
  {
    path: "/",
    component: (props) => {
      return (
        <div class="p-2 flex flex-col container m-auto">
          {"<div>Hi</div>"}

          <Portal mount={document.body}>{name.firstName}</Portal>
          <ButtonPageList />

          <Await fallback="Page Is Loading">{props.children}</Await>
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
  },
];
