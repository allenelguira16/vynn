import { Suspense } from "vynn";
import { Outlet, Route } from "vynn-router";

import { ButtonPageList } from "./components/ButtonPageList";
import { Template } from "./components/Template";
import { Contexts } from "./pages/Contexts";
import { Dropdowns } from "./pages/DropdownList";
import { Forms } from "./pages/Forms";
import { NonAsyncSuspense } from "./pages/NonAsyncSuspense";
import { PokeDex } from "./pages/PokeDex";
import { PokeDexSuspense } from "./pages/PokeDexSuspense";
import { StackedSuspense } from "./pages/StackedSuspense";

export const routes: Route[] = [
  {
    path: "/",
    component: () => {
      console.log("hi");

      return (
        <div class="p-2 flex flex-col container m-auto">
          <ButtonPageList />

          <Outlet />
        </div>
      );
    },
    children: [
      {
        path: "/",
        component: () => (
          <>
            <Template title="Forms">
              <Forms />
            </Template>
            <Template title="Contexts">
              <Contexts />
            </Template>
            <Template title="Dropdown List">
              <Dropdowns />
            </Template>
            <Template title="Non-Async Suspense">
              <NonAsyncSuspense />
            </Template>
            <Template title="Stacked Suspense">
              <StackedSuspense />
            </Template>
            <Template title="PokeDex List">
              <PokeDex />
            </Template>
            <Template title="PokeDex List (via Suspense)">
              <PokeDexSuspense />
            </Template>
          </>
        ),
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
        component: () => (
          <Template title="Contexts">
            <Contexts />
          </Template>
        ),
      },
      {
        path: "/pokedex-list",
        component: () => (
          <Template title="PokeDex List">
            <PokeDex />
          </Template>
        ),
      },
      {
        path: "/stacked-suspense",
        component: () => (
          <Template title="Stacked Suspense">
            <StackedSuspense />
          </Template>
        ),
      },
      {
        path: "/pokedex-list-suspense",
        component: () => (
          <Template title="PokeDex List (via Suspense)">
            <PokeDexSuspense />
          </Template>
        ),
      },
      {
        path: "/dropdown-list",
        component: () => (
          <Template title="Dropdown List">
            <Dropdowns />
          </Template>
        ),
      },
      {
        path: "/forms",
        component: () => (
          <Template title="Forms">
            <Suspense>
              <Forms />
            </Suspense>
          </Template>
        ),
      },
      {
        path: "/non-async-suspense",
        component: () => (
          <Template title="Non-Async Suspense">
            <NonAsyncSuspense />
          </Template>
        ),
      },
    ],
  },
];
