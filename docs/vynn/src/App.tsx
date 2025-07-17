import { memo, Suspense } from "vynn";
import { Route, Router } from "vynn-router";

import Layout from "./Layout";
import { ComputedPage } from "./pages/ComputedPage";
import { EffectPage } from "./pages/EffectPage";
import { HomePage } from "./pages/HomePage";
import { InstallationPage } from "./pages/InstallationPage";
import { IntroductionPage } from "./pages/IntroductionPage";
import { LazyPage } from "./pages/LazyPage";
import { LoopPage } from "./pages/LoopPage";
import { MemoPage } from "./pages/MemoPage";
import { OnDestroyPage } from "./pages/OnDestroyPage";
import { OnMountPage } from "./pages/OnMountPage";
import { ResourcePage } from "./pages/ResourcePage";
import { StatePage } from "./pages/StatePage";
import { StorePage } from "./pages/StorePage";
import { SuspensePage } from "./pages/SuspensePage";
import { ThingsToKnowPage } from "./pages/ThingsToKnowPage";

export const App = () => {
  return (
    <Suspense>
      <Router routes={routes} />
    </Suspense>
  );
};

export const routes: Route[] = [
  {
    path: "/",
    component: memo(() => <HomePage />),
  },
  {
    path: "/docs",
    component: Layout,
    children: [
      {
        path: "/introduction",
        component: IntroductionPage,
      },
      {
        path: "/installation",
        component: InstallationPage,
      },
      {
        path: "/things-to-know",
        component: ThingsToKnowPage,
      },
      {
        path: "/core-concepts/on-mount",
        component: OnMountPage,
      },
      {
        path: "/core-concepts/on-destroy",
        component: OnDestroyPage,
      },
      {
        path: "/core-concepts/state",
        component: StatePage,
      },
      {
        path: "/core-concepts/store",
        component: StorePage,
      },
      {
        path: "/core-concepts/computed",
        component: ComputedPage,
      },
      {
        path: "/core-concepts/effect",
        component: EffectPage,
      },
      {
        path: "/core-concepts/resource",
        component: ResourcePage,
      },
      {
        path: "/core-concepts/suspense",
        component: SuspensePage,
      },
      {
        path: "/core-concepts/lazy",
        component: LazyPage,
      },
      {
        path: "/core-concepts/loop",
        component: LoopPage,
      },
      {
        path: "/core-concepts/memo",
        component: MemoPage,
      },
    ],
  },
];
