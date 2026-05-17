import { Outlet, Route } from "vynn-router";

import { ButtonPageList } from "./components/ButtonPageList";
import { Contexts } from "./pages/Contexts";
import { Dropdowns } from "./pages/DropdownList";
import { Forms } from "./pages/Forms";
import { Lazy } from "./pages/Lazy";
import { NonAsyncSuspense } from "./pages/NonAsyncSuspense";
import { PokeDex } from "./pages/PokeDex";
import { PokeDexSuspense } from "./pages/PokeDexSuspense";
import { StackedSuspense } from "./pages/StackedSuspense";

export const routes: Route[] = [
  {
    path: "/",
    component: () => {
      console.log("layout rerender");

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
            <Lazy />
            <Forms />
            <Contexts />
            <Dropdowns />
            <NonAsyncSuspense />
            <StackedSuspense />
            <PokeDex />
            <PokeDexSuspense />
          </>
        ),
      },
      {
        path: "/lazy",
        component: Lazy,
      },
      {
        path: "/contexts",
        component: Contexts,
      },
      {
        path: "/stacked-suspense",
        component: StackedSuspense,
      },
      {
        path: "/poke-dex",
        component: PokeDex,
      },
      {
        path: "/poke-dex-suspense",
        component: PokeDexSuspense,
      },
      {
        path: "/dropdown-list",
        component: Dropdowns,
      },
      {
        path: "/forms",
        component: Forms,
      },
      {
        path: "/non-async-suspense",
        component: NonAsyncSuspense,
      },
    ],
  },
];
