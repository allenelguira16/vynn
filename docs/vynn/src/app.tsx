import "./main.css";
import { Await, lazy } from "vynn";
import { Route, Router } from "vynn-router";

import Layout from "./Layout";
const ComputedPage = lazy(() => import("./pages/ComputedPage"), "ComputedPage");
const EffectPage = lazy(() => import("./pages/EffectPage"), "EffectPage");
const HomePage = lazy(() => import("./pages/HomePage"), "HomePage");
const InstallationPage = lazy(() => import("./pages/InstallationPage"), "InstallationPage");
const IntroductionPage = lazy(() => import("./pages/IntroductionPage"), "IntroductionPage");
const LazyPage = lazy(() => import("./pages/LazyPage"), "LazyPage");
const LoopPage = lazy(() => import("./pages/LoopPage"), "LoopPage");
const MemoPage = lazy(() => import("./pages/MemoPage"), "MemoPage");
const OnDestroyPage = lazy(() => import("./pages/OnDestroyPage"), "OnDestroyPage");
const OnMountPage = lazy(() => import("./pages/OnMountPage"), "OnMountPage");
const ResourcePage = lazy(() => import("./pages/ResourcePage"), "ResourcePage");
const StatePage = lazy(() => import("./pages/StatePage"), "StatePage");
const StorePage = lazy(() => import("./pages/StorePage"), "StorePage");
const SuspensePage = lazy(() => import("./pages/SuspensePage"), "SuspensePage");
const ThingsToKnowPage = lazy(() => import("./pages/ThingsToKnowPage"), "ThingsToKnowPage");

export const App = (props: { url: string }) => {
  return (
    <html>
      <head>
        <title>Vynn</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg"></link>
        <meta name="description" content="Vynn documentation" />
        <meta property="og:title" content="Vynn" />
        <meta property="og:description" content="Vynn documentation" />
        <meta property="og:type" content="website" />
      </head>
      <body>
        <Await>
          <Router routes={routes} url={props.url} />
        </Await>
      </body>
    </html>
  );
};

export const routes: Route[] = [
  {
    path: "/",
    component: HomePage,
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
